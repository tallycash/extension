import Dexie from "dexie"
import { TokenList } from "@uniswap/token-lists"

import { AccountBalance } from "../../accounts"
import { Network } from "../../networks"
import {
  AnyAsset,
  FungibleAsset,
  PricePoint,
  SmartContractFungibleAsset,
  TokenListCitation,
} from "../../assets"
import { normalizeEVMAddress } from "../../lib/utils"

/*
 * IndexedPricePoint extends PricePoint to expose each asset's ID directly for
 * database index purposes.
 */
export type IndexedPricePoint = PricePoint & {
  asset1ID: string
  asset2ID: string
}

/*
 * PriceMeasurement is a IndexedPricePoint extension with additional bookkeeping
 * to keep track of how the price was measured and saved.
 */
export type PriceMeasurement = IndexedPricePoint & {
  /*
   * When the price was retrieved, independent from the time which the
   * PricePoint purportis to represent.
   */
  retrievedAt: number

  /*
   * An attempt to keep loose track of price data sources. It's unclear whether
   * we'll need more than a simple string down the road.
   */
  dataSource: "coingecko"

  /*
   * An optional exchange identifier.
   */
  exchange?: string
}

/*
 * CachedTokenList combines the specificty of TokenListCitation as a way to
 * reference a token list with actual token list, as well as a retrieval date.
 *
 * This detail will allow for disambiguation in case a token list publisher has
 * issues with backdating or improperly incremented version numbers.
 */
export type CachedTokenList = TokenListCitation & {
  retrievedAt: number
  list: TokenList
}

export interface Migration {
  id: number
  appliedAt: number
}

/*
 * A rough attempt at canonical IDs for assets. Doing this well is tough without
 * either centrally managed IDs, or going full semantic / ontology.
 */
function assetID(asset: AnyAsset): string {
  const id = `${asset.symbol}`
  if (!("contractAddress" in asset)) {
    return id
  }
  const network = asset.homeNetwork
  return `${id}/${asset.contractAddress}/${network.family}/${network.name}`
}

/*
 * Normalize price points for consistent comparison and database indexing.
 */
function normalizePricePoint(pricePoint: PricePoint): IndexedPricePoint {
  // symbol/contractAddress/home-network-family/home-network-name
  const asset1ID = assetID(pricePoint.pair[0])
  const asset2ID = assetID(pricePoint.pair[1])
  return asset1ID.localeCompare(asset2ID) > 0
    ? {
        ...pricePoint,
        asset1ID,
        asset2ID,
      }
    : {
        time: pricePoint.time,
        pair: [pricePoint.pair[1], pricePoint.pair[0]],
        amounts: [pricePoint.amounts[1], pricePoint.amounts[0]],
        asset1ID: asset2ID,
        asset2ID: asset1ID,
      }
}

function numberArrayCompare(arr1: number[], arr2: number[]) {
  for (let i = 0; i < arr1.length; i += 1) {
    if (arr1[i] > arr2[i]) {
      return 1
    }
    if (arr1[i] < arr2[i]) {
      return -1
    }
  }
  return 0
}

export class IndexingDatabase extends Dexie {
  private prices!: Dexie.Table<PriceMeasurement, number>

  /*
   * Historic account balances.
   */
  private balances!: Dexie.Table<AccountBalance, number>

  /*
   * Cached token lists maintaining fungible asset metadata.
   */
  private tokenLists!: Dexie.Table<CachedTokenList, number>

  /*
   * User- and contract-supplied fungible asset metadata.
   */
  private customAssets!: Dexie.Table<SmartContractFungibleAsset, number>

  /*
   * Tokens whose balances should be checked periodically. It might make sense
   * for this to be tracked against particular accounts in the future.
   */
  private assetsToTrack!: Dexie.Table<SmartContractFungibleAsset, number>

  private migrations!: Dexie.Table<Migration, number>

  constructor() {
    super("tally/indexing")
    this.version(1).stores({
      migrations: "++id,appliedAt",
      prices: "++id,time,[asset1ID+asset2ID]",
      balances:
        "++id,address,assetAmount.amount,assetAmount.asset.symbol,network.name,blockHeight,retrievedAt",
      tokenLists: "++id,url,retrievedAt",
      customAssets:
        "&[contractAddress+homeNetwork.name],contractAddress,symbol,homeNetwork.chainId,homeNetwork.name",
      assetsToTrack:
        "&[contractAddress+homeNetwork.name],symbol,contractAddress,homeNetwork.family,homeNetwork.chainId,homeNetwork.name",
    })
  }

  async savePriceMeasurement(
    pricePoint: PricePoint,
    retrievedAt: number,
    dataSource: PriceMeasurement["dataSource"],
    exchange?: string
  ): Promise<void> {
    const measurement = {
      ...normalizePricePoint(pricePoint),
      retrievedAt,
      dataSource,
      exchange,
    }
    await this.prices.add(measurement)
  }

  async getLatestAccountBalance(
    address: string,
    network: Network,
    asset: FungibleAsset
  ): Promise<AccountBalance | null> {
    // TODO this needs to be tightened up, both for performance and specificity
    const balanceCandidates = await this.balances
      .where("retrievedAt")
      .above(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .filter(
        (balance) =>
          normalizeEVMAddress(balance.address) ===
            normalizeEVMAddress(address) &&
          balance.assetAmount.asset.symbol === asset.symbol &&
          balance.network.name === network.name
      )
      .reverse()
      .sortBy("retrievedAt")
    return balanceCandidates.length > 0 ? balanceCandidates[0] : null
  }

  async addAssetToTrack(asset: SmartContractFungibleAsset): Promise<void> {
    this.assetsToTrack.put(asset)
  }

  async getAssetsToTrack(): Promise<SmartContractFungibleAsset[]> {
    // TODO move "assets to track" to expire over time and require a refresh
    // to keep from balance checking tons of irrelevant tokens
    // see https://github.com/tallycash/tally-extension/issues/136 for details
    return this.assetsToTrack.toArray()
  }

  async getCustomAssetsByNetwork(
    network: Network
  ): Promise<SmartContractFungibleAsset[]> {
    return this.customAssets
      .where("homeNetwork.name")
      .equals(network.name)
      .toArray()
  }

  async getCustomAssetByAddressAndNetwork(
    network: Network,
    contractAddress: string
  ): Promise<SmartContractFungibleAsset | undefined> {
    return this.customAssets
      .where("[contractAddress+homeNetwork.name]")
      .equals([network.name, normalizeEVMAddress(contractAddress)])
      .first()
  }

  async addCustomAsset(asset: SmartContractFungibleAsset): Promise<void> {
    this.customAssets.put(asset)
  }

  async addBalances(accountBalances: AccountBalance[]): Promise<void> {
    await this.balances.bulkAdd(accountBalances)
  }

  async getLatestTokenList(url: string): Promise<CachedTokenList | null> {
    const candidateLists = await this.tokenLists
      .where("url")
      .equals(url)
      .reverse()
      .sortBy("retrievedAt")
    if (candidateLists.length > 0) {
      return candidateLists[0]
    }
    return null
  }

  async saveTokenList(url: string, list: TokenList): Promise<void> {
    const cachedList = {
      name: list.name,
      logoURL: list.logoURI,
      url,
      retrievedAt: Date.now(),
      list,
    }
    await this.tokenLists.add(cachedList)
  }

  async getLatestTokenLists(
    urls: string[]
  ): Promise<{ url: string; tokenList: TokenList }[]> {
    const candidateLists = (await this.tokenLists
      .where("url")
      .anyOf(urls)
      .toArray()) as CachedTokenList[]
    return Object.entries(
      candidateLists.reduce((acc, cachedList) => {
        if (!(cachedList.url in acc)) {
          acc[cachedList.url] = cachedList.list
        } else {
          const orig = acc[cachedList.url]
          const origV = [
            orig.version.major,
            orig.version.minor,
            orig.version.patch,
          ]
          const cachedV = [
            cachedList.list.version.major,
            cachedList.list.version.minor,
            cachedList.list.version.patch,
          ]
          if (numberArrayCompare(origV, cachedV) < 0) {
            acc[cachedList.url] = cachedList.list
          }
        }
        return { ...acc }
      }, {} as { [url: string]: TokenList })
    ).map(([k, v]) => ({
      url: k,
      tokenList: v as TokenList,
    }))
  }

  private async migrate() {
    const numMigrations = await this.migrations.count()
    if (numMigrations === 0) {
      await this.transaction("rw", this.migrations, async () => {
        this.migrations.add({ id: 0, appliedAt: Date.now() })
        // TODO decide migrations before the initial release
      })
    }
  }
}

export async function getOrCreateDB(): Promise<IndexingDatabase> {
  const db = new IndexingDatabase()

  // Call known-private migrate function, effectively treating it as
  // file-private.
  // eslint-disable-next-line @typescript-eslint/dot-notation
  await db["migrate"]()

  return db
}
