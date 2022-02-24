import logger from "../../lib/logger"

import { HexString } from "../../types"
import { EVMNetwork } from "../../networks"
import { AccountBalance, AddressOnNetwork } from "../../accounts"
import {
  AnyAsset,
  CoinGeckoAsset,
  FungibleAsset,
  isSmartContractFungibleAsset,
  PricePoint,
  SmartContractFungibleAsset,
} from "../../assets"
import { BTC, ETH, FIAT_CURRENCIES, USD } from "../../constants"
import { getBalances as getAssetBalances } from "../../lib/erc20"
import { getTokenBalances, getTokenMetadata } from "../../lib/alchemy"
import { getPrices, getEthereumTokenPrices } from "../../lib/prices"
import {
  fetchAndValidateTokenList,
  mergeAssets,
  networkAssetsFromLists,
} from "../../lib/tokenList"
import {
  getEthereumNetwork,
  normalizeEVMAddress,
  normalizeEVMAddressList,
  sameEVMAddress,
} from "../../lib/utils"
import PreferenceService from "../preferences"
import ChainService from "../chain"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import { getOrCreateDB, IndexingDatabase } from "./db"
import BaseService from "../base"
import { EnrichedEVMTransaction } from "../enrichment/types"

// Transactions seen within this many blocks of the chain tip will schedule a
// token refresh sooner than the standard rate.
const FAST_TOKEN_REFRESH_BLOCK_RANGE = 10

interface Events extends ServiceLifecycleEvents {
  accountBalance: AccountBalance
  price: PricePoint
  assets: AnyAsset[]
}

/**
 * IndexingService is responsible for pulling and maintaining all application-
 * level "indexing" data — things like fungible token balances and NFTs, as well
 * as more abstract application concepts like governance proposals.
 *
 * Today, the service periodically polls for price and token balance
 * changes for all tracked tokens and accounts, as well as up to date
 * token metadata. Relevant prices and balances are emitted as events.
 */
export default class IndexingService extends BaseService<Events> {
  /**
   * True if an off-cycle token refresh was scheduled, typically when a watched
   * account had a transaction confirmed.
   */
  private scheduledTokenRefresh = false

  /**
   * Create a new IndexingService. The service isn't initialized until
   * startService() is called and resolved.
   *
   * @param preferenceService - Required for token metadata and currency
   *        preferences.
   * @param chainService - Required for chain interactions.
   * @returns A new, initializing IndexingService
   */
  static create: ServiceCreatorFunction<
    Events,
    IndexingService,
    [Promise<PreferenceService>, Promise<ChainService>]
  > = async (preferenceService, chainService) => {
    return new this(
      await getOrCreateDB(),
      await preferenceService,
      await chainService
    )
  }

  private constructor(
    private db: IndexingDatabase,
    private preferenceService: PreferenceService,
    private chainService: ChainService
  ) {
    super({
      tokens: {
        schedule: {
          delayInMinutes: 1,
          periodInMinutes: 30,
        },
        handler: () => this.handleTokenAlarm(),
        runAtStart: true,
      },
      tokenRefreshes: {
        schedule: {
          periodInMinutes: 1,
        },
        handler: () => this.handleTokenRefresh(),
      },
      prices: {
        schedule: {
          delayInMinutes: 1,
          periodInMinutes: 10,
        },
        handler: () => this.handlePriceAlarm(),
        runAtStart: true,
      },
    })
  }

  async internalStartService(): Promise<void> {
    await super.internalStartService()

    this.connectChainServiceEvents()

    // on launch, push any assets we have cached
    this.emitter.emit(
      "assets",
      await this.getCachedAssets(this.chainService.ethereumNetwork)
    )

    // ... and kick off token list fetching
    await this.fetchAndCacheTokenLists()
  }

  /**
   * Get all assets we're tracking, for both balances and prices. Only fungible
   * assets are currently supported.
   *
   * @returns An array of fungible smart contract assets.
   */
  async getAssetsToTrack(): Promise<SmartContractFungibleAsset[]> {
    return this.db.getAssetsToTrack()
  }

  /**
   * Begin tracking the price and any balance changes of a fungible network-
   * specific asset.
   *
   * @param asset The fungible asset to track.
   */
  async addAssetToTrack(asset: SmartContractFungibleAsset): Promise<void> {
    // TODO Track across all account/network pairs, not just on one network or
    // TODO account.
    return this.db.addAssetToTrack(asset)
  }

  /**
   * Retrieves the latest balance of the specified asset for the specified
   * account on the specified network.
   *
   * @param account The account that owns the given asset.
   * @param network The network on which the balance is being checked.
   * @param asset The asset whose balance is being checked.
   */
  async getLatestAccountBalance(
    account: string,
    network: EVMNetwork,
    asset: FungibleAsset
  ): Promise<AccountBalance | null> {
    return this.db.getLatestAccountBalance(
      normalizeEVMAddress(account),
      network,
      asset
    )
  }

  /**
   * Get cached asset metadata from hard-coded base assets and configured token
   * lists.
   *
   * @returns An array of assets, including base assets that are "built in" to
   *          the codebase. Fiat currencies are not included.
   */
  async getCachedAssets(network: EVMNetwork): Promise<AnyAsset[]> {
    const baseAssets = [BTC, ETH]
    const customAssets = await this.db.getCustomAssetsByNetwork(network)
    const tokenListPrefs =
      await this.preferenceService.getTokenListPreferences()
    const tokenLists = await this.db.getLatestTokenLists(tokenListPrefs.urls)

    return mergeAssets(
      baseAssets,
      customAssets,
      networkAssetsFromLists(network, tokenLists)
    )
  }

  /**
   * Find the metadata for a known SmartContractFungibleAsset based on the
   * network and address.
   *
   * @param network - the home network of the asset
   * @param contractAddress - the address of the asset on its home network
   */
  async getKnownSmartContractAsset(
    network: EVMNetwork,
    contractAddress: HexString
  ): Promise<SmartContractFungibleAsset> {
    const knownAssets = await this.getCachedAssets(network)
    const found = knownAssets.find(
      (asset) =>
        "decimals" in asset &&
        "homeNetwork" in asset &&
        "contractAddress" in asset &&
        asset.homeNetwork.name === network.name &&
        normalizeEVMAddress(asset.contractAddress) ===
          normalizeEVMAddress(contractAddress)
    )
    return found as SmartContractFungibleAsset
  }

  /* *****************
   * PRIVATE METHODS *
   ******************* */

  async notifyEnrichedTransaction(
    enrichedEVMTransaction: EnrichedEVMTransaction
  ): Promise<void> {
    const jointAnnotations =
      typeof enrichedEVMTransaction.annotation === "undefined"
        ? []
        : [
            enrichedEVMTransaction.annotation,
            ...(enrichedEVMTransaction.annotation.subannotations ?? []),
          ]

    jointAnnotations.forEach((annotation) => {
      // Note asset transfers of smart contract assets to or from an
      // address we're tracking, and ensure we're tracking that asset +
      // that we do a balance check soon.
      if (
        typeof annotation !== "undefined" &&
        annotation.type === "asset-transfer" &&
        isSmartContractFungibleAsset(annotation.assetAmount.asset) &&
        this.chainService.isTrackingAddressesOnNetworks(
          {
            address: normalizeEVMAddress(annotation.senderAddress),
            network: enrichedEVMTransaction.network,
          },
          {
            address: normalizeEVMAddress(annotation.recipientAddress),
            network: enrichedEVMTransaction.network,
          }
        )
      ) {
        this.addAssetToTrack(annotation.assetAmount.asset)
        this.scheduledTokenRefresh = true
      }
    })
  }

  private async connectChainServiceEvents(): Promise<void> {
    // listen for assetTransfers, and if we find them, track those tokens
    // TODO update for NFTs
    this.chainService.emitter.on(
      "assetTransfers",
      async ({ addressNetwork, assetTransfers }) => {
        assetTransfers.forEach((transfer) => {
          const fungibleAsset = transfer.assetAmount
            .asset as SmartContractFungibleAsset
          if (fungibleAsset.contractAddress && fungibleAsset.decimals) {
            this.addTokenToTrackByContract(
              addressNetwork,
              normalizeEVMAddress(fungibleAsset.contractAddress)
            )
          }
        })
      }
    )

    this.chainService.emitter.on(
      "newAccountToTrack",
      async (addressOnNetwork) => {
        // whenever a new account is added, get token balances from Alchemy's
        // default list and add any non-zero tokens to the tracking list
        const balances = await this.retrieveTokenBalances(addressOnNetwork)

        // FIXME Refactor this to only update prices for tokens with balances.
        await this.handlePriceAlarm()

        // Every asset we have that hasn't already been balance checked and is
        // on the currently selected network should be checked once.
        //
        // Note that we'll want to move this to a queuing system that can be
        // easily rate-limited eventually.
        const checkedContractAddresses = new Set(
          balances
            .map((b) => normalizeEVMAddress(b.contractAddress))
            .filter(Boolean)
        )
        const cachedAssets = await this.getCachedAssets(
          addressOnNetwork.network
        )
        const otherActiveAssets = cachedAssets
          .filter(isSmartContractFungibleAsset)
          .filter(
            (a) =>
              a.homeNetwork.chainID === addressOnNetwork.network.chainID &&
              !checkedContractAddresses.has(
                normalizeEVMAddress(a.contractAddress)
              )
          )

        await this.retrieveTokenBalances(
          addressOnNetwork,
          otherActiveAssets.map((a) => normalizeEVMAddress(a.contractAddress))
        )
      }
    )

    this.chainService.emitter.on(
      "transaction",
      async ({ transaction, forAccounts }) => {
        if (
          "status" in transaction &&
          transaction.status === 1 &&
          transaction.blockHeight >
            (await this.chainService.getBlockHeight(transaction.network)) -
              FAST_TOKEN_REFRESH_BLOCK_RANGE
        ) {
          this.scheduledTokenRefresh = true
        }
        if (
          "status" in transaction &&
          (transaction.status === 1 || transaction.status === 0)
        ) {
          forAccounts.forEach((accountAddress) => {
            this.chainService.getLatestBaseAccountBalance({
              address: accountAddress,
              network: transaction.network,
            })
          })
        }
      }
    )
  }

  /**
   * Retrieve token balances for a particular account on a particular network,
   * saving the resulting balances and adding any asset with a non-zero balance
   * to the list of assets to track.
   *
   * @param addressNetwork
   * @param contractAddresses
   */
  private async retrieveTokenBalances(
    addressNetwork: AddressOnNetwork,
    contractAddresses?: HexString[]
  ): ReturnType<typeof getTokenBalances> {
    const balances = await getTokenBalances(
      this.chainService.pollingProviders.ethereum,
      normalizeEVMAddress(addressNetwork.address),
      contractAddresses != null
        ? normalizeEVMAddressList(contractAddresses)
        : contractAddresses
    )

    // look up all assets and set balances
    await Promise.allSettled(
      balances.map(async (b) => {
        const knownAsset = await this.getKnownSmartContractAsset(
          addressNetwork.network,
          normalizeEVMAddress(b.contractAddress)
        )
        if (knownAsset) {
          const accountBalance = {
            ...addressNetwork,
            assetAmount: {
              asset: knownAsset,
              amount: b.amount,
            },
            retrievedAt: Date.now(),
            dataSource: "alchemy",
          } as const
          await this.db.addBalances([accountBalance])
          this.emitter.emit("accountBalance", accountBalance)
          if (b.amount > 0) {
            await this.addAssetToTrack(knownAsset)
          }
        } else if (b.amount > 0) {
          await this.addTokenToTrackByContract(
            addressNetwork,
            normalizeEVMAddress(b.contractAddress)
          )
          // TODO we're losing balance information here, consider an
          // addTokenAndBalanceToTrackByContract method
        }
      })
    )
    return balances
  }

  /**
   * Add an asset to track to a particular account and network, specified by the
   * contract address and optional decimals.
   *
   * If the asset has already been cached, use that. Otherwise, infer asset
   * details from the contract and outside services.
   *
   * @param addressOnNetwork the account and network on which this asset should
   *        be tracked
   * @param contractAddress the address of the token contract on this network
   * @param decimals optionally include the number of decimals tracked by a
   *        fungible asset. Useful in case this asset isn't found in existing
   *        metadata.
   */
  private async addTokenToTrackByContract(
    addressOnNetwork: AddressOnNetwork,
    contractAddress: string
  ): Promise<void> {
    const { network } = addressOnNetwork
    const knownAssets = await this.getCachedAssets(network)
    const found = knownAssets.find(
      (asset) =>
        "decimals" in asset &&
        "homeNetwork" in asset &&
        asset.homeNetwork.name === network.name &&
        "contractAddress" in asset &&
        sameEVMAddress(asset.contractAddress, contractAddress)
    )
    if (found) {
      this.addAssetToTrack(found as SmartContractFungibleAsset)
    } else {
      let customAsset = await this.db.getCustomAssetByAddressAndNetwork(
        network,
        normalizeEVMAddress(contractAddress)
      )
      if (!customAsset) {
        // TODO hardcoded to Ethereum
        const provider = this.chainService.pollingProviders.ethereum
        // pull metadata from Alchemy
        customAsset =
          (await getTokenMetadata(provider, {
            address: normalizeEVMAddress(contractAddress),
            network,
          })) || undefined

        if (customAsset) {
          await this.db.addCustomAsset(customAsset)
          this.emitter.emit("assets", [customAsset])
        }
      }

      // TODO if we still don't have anything, use a contract read + a
      // CoinGecko lookup
      if (customAsset) {
        this.addAssetToTrack(customAsset)
      }
    }
  }

  private async handlePriceAlarm(): Promise<void> {
    // TODO refactor for multiple price sources
    try {
      // TODO include user-preferred currencies
      // get the prices of ETH and BTC vs major currencies
      const basicPrices = await getPrices(
        [BTC, ETH] as CoinGeckoAsset[],
        FIAT_CURRENCIES
      )

      // kick off db writes and event emission, don't wait for the promises to
      // settle
      const measuredAt = Date.now()
      basicPrices.forEach((pricePoint) => {
        this.emitter.emit("price", pricePoint)
        this.db
          .savePriceMeasurement(pricePoint, measuredAt, "coingecko")
          .catch((err) =>
            logger.error(
              "Error saving price point",
              err,
              pricePoint,
              measuredAt
            )
          )
      })
    } catch (e) {
      logger.error("Error getting base asset prices", BTC, ETH, FIAT_CURRENCIES)
    }

    // get the prices of all assets to track and save them
    const assetsToTrack = await this.db.getAssetsToTrack()

    // Filter all assets based on the currently selected network
    const activeAssetsToTrack = assetsToTrack.filter(
      (asset) =>
        asset.symbol === "ETH" ||
        asset.homeNetwork.chainID === this.chainService.ethereumNetwork.chainID
    )

    try {
      // TODO only uses USD
      const activeAssetsByAddress = activeAssetsToTrack.reduce((agg, t) => {
        const newAgg = {
          ...agg,
        }
        newAgg[normalizeEVMAddress(t.contractAddress)] = t
        return newAgg
      }, {} as { [address: string]: SmartContractFungibleAsset })
      const measuredAt = Date.now()
      const activeAssetPrices = await getEthereumTokenPrices(
        Object.keys(activeAssetsByAddress),
        USD
      )
      Object.entries(activeAssetPrices).forEach(
        ([contractAddress, unitPricePoint]) => {
          const normalizedContractAddress = normalizeEVMAddress(contractAddress)
          const asset = activeAssetsByAddress[normalizedContractAddress]
          if (asset) {
            // TODO look up fiat currency
            const pricePoint = {
              pair: [asset, USD],
              amounts: [
                1n * 10n ** BigInt(asset.decimals),
                BigInt(
                  Math.trunc(
                    (Number(unitPricePoint.unitPrice.amount) /
                      10 **
                        (unitPricePoint.unitPrice.asset as FungibleAsset)
                          .decimals) *
                      10 ** USD.decimals
                  )
                ),
              ], // TODO not a big fan of this lost precision
              time: unitPricePoint.time,
            } as PricePoint
            this.emitter.emit("price", pricePoint)
            // TODO move the "coingecko" data source elsewhere
            this.db
              .savePriceMeasurement(pricePoint, measuredAt, "coingecko")
              .catch(() =>
                logger.error("Error saving price point", pricePoint, measuredAt)
              )
          } else {
            logger.warn(
              "Discarding price from unknown asset",
              normalizedContractAddress,
              unitPricePoint
            )
          }
        }
      )
    } catch (err) {
      logger.error("Error getting token prices", activeAssetsToTrack, err)
    }
  }

  private async fetchAndCacheTokenLists(): Promise<void> {
    const tokenListPrefs =
      await this.preferenceService.getTokenListPreferences()
    // load each token list in preferences
    await Promise.allSettled(
      tokenListPrefs.urls.map(async (url) => {
        const cachedList = await this.db.getLatestTokenList(url)
        if (!cachedList) {
          try {
            const newListRef = await fetchAndValidateTokenList(url)
            await this.db.saveTokenList(url, newListRef.tokenList)
          } catch (err) {
            logger.error(
              `Error fetching, validating, and saving token list ${url}`
            )
          }
        }
        this.emitter.emit(
          "assets",
          await this.getCachedAssets(this.chainService.ethereumNetwork)
        )
      })
    )

    // TODO if tokenListPrefs.autoUpdate is true, pull the latest and update if
    // the version has gone up
  }

  private async handleTokenRefresh(): Promise<void> {
    if (this.scheduledTokenRefresh) {
      await this.handleTokenAlarm()
      this.scheduledTokenRefresh = false
    }
  }

  private async handleTokenAlarm(): Promise<void> {
    // no need to block here, as the first fetch blocks the entire service init
    this.fetchAndCacheTokenLists()

    const assetsToTrack = await this.db.getAssetsToTrack()
    // TODO doesn't support multi-network assets
    // like USDC or CREATE2-based contracts on L1/L2
    const activeAssetsToTrack = assetsToTrack.filter(
      (asset) =>
        asset.homeNetwork.chainID === this.chainService.ethereumNetwork.chainID
    )

    // wait on balances being written to the db, don't wait on event emission
    await Promise.allSettled(
      (
        await this.chainService.getAccountsToTrack()
      ).map(async (addressOnNetwork) => {
        // TODO hardcoded to Ethereum
        const balances = await getAssetBalances(
          this.chainService.pollingProviders.ethereum,
          activeAssetsToTrack,
          addressOnNetwork
        )
        balances.forEach((ab) => this.emitter.emit("accountBalance", ab))
        await this.db.addBalances(balances)
      })
    )
  }
}
