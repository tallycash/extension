import Transport from "@ledgerhq/hw-transport"
import TransportWebUSB from "@ledgerhq/hw-transport-webusb"
import TransportWebAuthn from "@ledgerhq/hw-transport-webauthn"
import Eth from "@ledgerhq/hw-app-eth"
import { DeviceModelId } from "@ledgerhq/devices"
import {
  serialize,
  UnsignedTransaction,
  parse as parseRawTransaction,
} from "@ethersproject/transactions"
import {
  joinSignature,
  _TypedDataEncoder,
  getAddress as ethersGetAddress,
} from "ethers/lib/utils"
import {
  EIP1559TransactionRequest,
  EVMNetwork,
  SignedEVMTransaction,
} from "../../networks"
import { EIP712TypedData, HexString } from "../../types"
import BaseService from "../base"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import logger from "../../lib/logger"
import { getOrCreateDB, LedgerAccount, LedgerDatabase } from "./db"
import { ethersTransactionRequestFromEIP1559TransactionRequest } from "../chain/utils"
import { ETH } from "../../constants"
import { normalizeEVMAddress } from "../../lib/utils"
import { HIDE_IMPORT_LEDGER } from "../../features/features"

enum LedgerType {
  UNKNOWN,
  LEDGER_NANO_S,
  LEDGER_NANO_X,
}

const LedgerTypeAsString = Object.values(LedgerType)

export const LedgerProductDatabase = {
  LEDGER_NANO_S: { productId: 0x1015 },
  LEDGER_NANO_X: { productId: 0x4015 },
}

export const isLedgerSupported = !HIDE_IMPORT_LEDGER

const TestedProductId = (productId: number): boolean => {
  return Object.values(LedgerProductDatabase).some(
    (e) => e.productId === productId
  )
}

type MetaData = {
  ethereumVersion: string
  isArbitraryDataSigningEnabled: boolean
}

export type ConnectedDevice = {
  id: string
  type: LedgerType
  metadata: MetaData
}

type Events = ServiceLifecycleEvents & {
  ledgerAdded: {
    id: string
    type: LedgerType
    accountIDs: string[]
    metadata: MetaData
  }
  ledgerAccountAdded: {
    id: string
    ledgerID: string
    derivationPath: string
    addresses: HexString[]
  }
  connected: ConnectedDevice
  disconnected: { id: string; type: LedgerType }
  address: { ledgerID: string; derivationPath: string; address: HexString }
  signedTransaction: SignedEVMTransaction
  signedData: string
  usbDeviceCount: number
}

export const idDerviationPath = "44'/60'/0'/0/0"

async function deriveAddressOnLedger(path: string, eth: Eth) {
  // eslint-disable-next-line no-useless-catch
  try {
    const derivedIdentifiers = await eth.getAddress(path)
    const address = ethersGetAddress(derivedIdentifiers.address)
    return address
  } catch (e) {
    // eslint-disable-next-line no-debugger
    debugger
    throw e
  }
}

async function generateLedgerId(
  transport: Transport,
  eth: Eth
): Promise<[string | undefined, LedgerType]> {
  // let extensionDeviceType = LedgerType.UNKNOWN

  // if (!transport.deviceModel) {
  //   throw new Error("Missing device model descriptor!")
  // }

  // switch (transport.deviceModel.id) {
  //   case DeviceModelId.nanoS:
  //     extensionDeviceType = LedgerType.LEDGER_NANO_S
  //     break
  //   case DeviceModelId.nanoX:
  //     extensionDeviceType = LedgerType.LEDGER_NANO_X
  //     break
  //   default:
  //     extensionDeviceType = LedgerType.UNKNOWN
  // }

  // if (extensionDeviceType === LedgerType.UNKNOWN) {
  //   return [undefined, extensionDeviceType]
  // }

  // if (extensionDeviceType === LedgerType.UNKNOWN) {
  //   return [undefined, extensionDeviceType]
  // }

  const address = await deriveAddressOnLedger(idDerviationPath, eth)

  return [address, LedgerType.LEDGER_NANO_S]
}

function getTransport(): Promise<Transport> {
  const isChrome =
    /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)

  // console.log("isChrome?", isChrome)

  if (isChrome) {
    return TransportWebUSB.create()
  }

  return TransportWebAuthn.create()
}

/**
 * The LedgerService is responsible for exposing the functionality of
 * Ledger devices in a digestible form by other services
 *
 * To do so, it does:
 *   - serialize the calls to the critical resource (ie. Ledger)
 *   - acts when a paired device is (dis-)connected
 *   - supports address derivation from BIP32 paths
 *   - supports transaction signing
 *   - supports typed data signing
 *   - maps the successfully onboarded addresses to their derivation paths
 *
 * Known issues
 *   - this service's kryptonite is having multiple browser-paired Ledgers
 *     connected to the computer. In that case the Wallet doesn't know
 *     which device will respond to its requests
 */
export default class LedgerService extends BaseService<Events> {
  #currentLedgerId: string | null = null

  transport: Transport | undefined = undefined

  #lastOperationPromise = Promise.resolve()

  static create: ServiceCreatorFunction<Events, LedgerService, []> =
    async () => {
      return new this(await getOrCreateDB())
    }

  private constructor(private db: LedgerDatabase) {
    super()
  }

  private runSerialized<T>(operation: () => Promise<T>) {
    const oldOperationPromise = this.#lastOperationPromise
    const newOperationPromise = oldOperationPromise.then(async () =>
      operation()
    )

    this.#lastOperationPromise = newOperationPromise.then(
      () => {},
      () => {}
    )

    return newOperationPromise
  }

  async onConnection(productId: number): Promise<void> {
    return this.runSerialized(async () => {
      // if (!TestedProductId(productId)) {
      //   return
      // }

      if (!this.transport) {
        this.transport = await getTransport()
      }
      this.transport.setScrambleKey("w0w")

      if (!this.transport) {
        throw new Error("Where Lambo?")
      }
      // eslint-disable-next-line no-debugger
      debugger
      const eth = new Eth(this.transport)

      const [id, type] = await generateLedgerId(this.transport, eth)

      if (!id) {
        throw new Error("Can't derive meaningful identification address!")
      }

      const appData = await eth.getAppConfiguration()

      const normalizedID = normalizeEVMAddress(id)

      this.#currentLedgerId = `${LedgerTypeAsString[type]}_${normalizedID}`

      this.emitter.emit("connected", {
        id: this.#currentLedgerId,
        type,
        metadata: {
          ethereumVersion: appData.version,
          isArbitraryDataSigningEnabled: appData.arbitraryDataEnabled !== 0,
        },
      })

      const knownAddresses = await this.db.getAllAccountsByLedgerId(
        this.#currentLedgerId
      )

      if (!knownAddresses.length) {
        this.emitter.emit("ledgerAdded", {
          id: this.#currentLedgerId,
          type,
          accountIDs: [idDerviationPath],
          metadata: {
            ethereumVersion: appData.version,
            isArbitraryDataSigningEnabled: appData.arbitraryDataEnabled !== 0,
          },
        })
      }
    })
  }

  #handleUSBConnect = async (event: USBConnectionEvent): Promise<void> => {
    // this.emitter.emit(
    //   "usbDeviceCount",
    //   (await navigator.usb.getDevices()).length
    // )
    if (!TestedProductId(event.device.productId)) {
      return
    }

    this.onConnection(event.device.productId)
  }

  #handleUSBDisconnect = async (event: USBConnectionEvent): Promise<void> => {
    // this.emitter.emit(
    //   "usbDeviceCount",
    //   (await navigator.usb.getDevices()).length
    // )
    if (!this.#currentLedgerId) {
      return
    }

    this.emitter.emit("disconnected", {
      id: this.#currentLedgerId,
      type: LedgerType.LEDGER_NANO_S,
    })

    this.#currentLedgerId = null
  }

  protected async internalStartService(): Promise<void> {
    await super.internalStartService() // Not needed, but better to stick to the patterns

    this.refreshConnectedLedger()

    // navigator.usb.addEventListener("connect", this.#handleUSBConnect)
    // navigator.usb.addEventListener("disconnect", this.#handleUSBDisconnect)
  }

  protected async internalStopService(): Promise<void> {
    await super.internalStartService() // Not needed, but better to stick to the patterns

    // navigator.usb.removeEventListener("disconnect", this.#handleUSBDisconnect)
    // navigator.usb.removeEventListener("connect", this.#handleUSBConnect)
  }

  async refreshConnectedLedger(): Promise<string | null> {
    if (TransportWebAuthn.isSupported) {
      this.transport = await TransportWebAuthn.create()
      this.transport?.setScrambleKey("w0w")
      this.emitter.emit("usbDeviceCount", 1)

      await this.onConnection(0)
    } else {
      // const usbDeviceArray = await navigator.usb.getDevices()
      // this.emitter.emit("usbDeviceCount", usbDeviceArray.length)
      // if (usbDeviceArray.length === 0 || usbDeviceArray.length > 1) {
      //   return null // Nasty things may happen when we've got zero or multiple choices
      // }
      // if (usbDeviceArray.length === 1) {
      //   await this.onConnection(usbDeviceArray[0].productId)
      // }
    }

    return this.#currentLedgerId
  }

  async deriveAddress(accountID: string): Promise<HexString> {
    return this.runSerialized(async () => {
      try {
        if (!this.transport) {
          throw new Error("Uninitialized transport!")
        }

        if (!this.#currentLedgerId) {
          throw new Error("Uninitialized Ledger ID!")
        }

        const eth = new Eth(this.transport)

        const accountAddress = normalizeEVMAddress(
          await deriveAddressOnLedger(accountID, eth)
        )

        this.emitter.emit("address", {
          ledgerID: this.#currentLedgerId,
          derivationPath: accountID,
          address: accountAddress,
        })

        return accountAddress
      } catch (err) {
        logger.error(
          `Error encountered! ledgerID: ${
            this.#currentLedgerId
          } accountID: ${accountID} error: ${err}`
        )
        throw err
      }
    })
  }

  async saveAddress(path: HexString, address: string): Promise<void> {
    if (!this.#currentLedgerId) {
      throw new Error("No Ledger id is set!")
    }

    await this.db.addAccount({ ledgerId: this.#currentLedgerId, path, address })
  }

  async signTransaction(
    network: EVMNetwork,
    transactionRequest: EIP1559TransactionRequest & { nonce: number },
    deviceID: string,
    path: string
  ): Promise<SignedEVMTransaction> {
    return this.runSerialized(async () => {
      try {
        if (!this.transport) {
          throw new Error("Uninitialized transport!")
        }

        if (!this.#currentLedgerId) {
          throw new Error("Uninitialized Ledger ID!")
        }

        const ethersTx =
          ethersTransactionRequestFromEIP1559TransactionRequest(
            transactionRequest
          )

        const serializedTx = serialize(
          ethersTx as UnsignedTransaction
        ).substring(2) // serialize adds 0x prefix which kills Eth::signTransaction

        const accountData = await this.db.getAccountByAddress(
          transactionRequest.from
        )

        this.checkCanSign(accountData, path, deviceID)

        const eth = new Eth(this.transport)
        const signature = await eth.signTransaction(path, serializedTx, null)

        const signedTransaction = serialize(ethersTx as UnsignedTransaction, {
          r: `0x${signature.r}`,
          s: `0x${signature.s}`,
          v: parseInt(signature.v, 16),
        })
        const tx = parseRawTransaction(signedTransaction)

        if (
          !tx.hash ||
          !tx.from ||
          !tx.r ||
          !tx.s ||
          typeof tx.v === "undefined"
        ) {
          throw new Error("Transaction doesn't appear to have been signed.")
        }

        if (
          typeof tx.maxPriorityFeePerGas === "undefined" ||
          typeof tx.maxFeePerGas === "undefined" ||
          tx.type !== 2
        ) {
          throw new Error("Can only sign EIP-1559 conforming transactions")
        }

        const signedTx: SignedEVMTransaction = {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          nonce: tx.nonce,
          input: tx.data,
          value: tx.value.toBigInt(),
          type: tx.type,
          gasPrice: null,
          maxFeePerGas: tx.maxFeePerGas.toBigInt(),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toBigInt(),
          gasLimit: tx.gasLimit.toBigInt(),
          r: tx.r,
          s: tx.s,
          v: tx.v,

          blockHash: null,
          blockHeight: null,
          asset: ETH,
          network,
        }

        return signedTx
      } catch (err) {
        logger.error(
          `Error encountered! ledgerID: ${
            this.#currentLedgerId
          } transactionRequest: ${transactionRequest} error: ${err}`
        )

        throw err
      }
    })
  }

  async signTypedData(
    typedData: EIP712TypedData,
    account: HexString,
    deviceID: string,
    path: string
  ): Promise<string> {
    return this.runSerialized(async () => {
      if (!this.transport) {
        throw new Error("Uninitialized transport!")
      }

      if (!this.#currentLedgerId) {
        throw new Error("Uninitialized Ledger ID!")
      }

      const eth = new Eth(this.transport)
      const { EIP712Domain, ...typesForSigning } = typedData.types
      const hashedDomain = _TypedDataEncoder.hashDomain(typedData.domain)
      const hashedMessage = _TypedDataEncoder
        .from(typesForSigning)
        .hash(typedData.message)

      const accountData = await this.db.getAccountByAddress(account)

      this.checkCanSign(accountData, path, deviceID)

      const signature = await eth.signEIP712HashedMessage(
        path,
        hashedDomain,
        hashedMessage
      )

      this.emitter.emit(
        "signedData",
        joinSignature({
          r: `0x${signature.r}`,
          s: `0x${signature.s}`,
          v: signature.v,
        })
      )

      return joinSignature({
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
        v: signature.v,
      })
    })
  }

  private checkCanSign(
    accountData: LedgerAccount | null,
    path: string,
    deviceID: string
  ) {
    if (
      !accountData ||
      path !== accountData.path ||
      deviceID !== accountData.ledgerId
    ) {
      throw new Error("Signing method mismatch!")
    }

    if (deviceID !== this.#currentLedgerId) {
      throw new Error("Cannot sign on wrong device attached!")
    }
  }

  async signMessage(address: string, message: string): Promise<string> {
    if (!this.transport) {
      throw new Error("Uninitialized transport!")
    }

    if (!this.#currentLedgerId) {
      throw new Error("Uninitialized Ledger ID!")
    }

    const accountData = await this.db.getAccountByAddress(address)

    if (!accountData) {
      throw new Error(
        `Address "${address}" doesn't have corresponding derivation path!`
      )
    }

    const eth = new Eth(this.transport)

    const signature = await eth.signPersonalMessage(
      accountData.path,
      Buffer.from(message).toString("hex")
    )

    const signatureHex = joinSignature({
      r: `0x${signature.r}`,
      s: `0x${signature.s}`,
      v: signature.v,
    })
    this.emitter.emit("signedData", signatureHex)

    return signatureHex
  }
}
