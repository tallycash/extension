import TrezorConnect, { DEVICE_EVENT, DEVICE } from "trezor-connect"
import {
  serialize,
  UnsignedTransaction,
  parse as parseRawTransaction,
} from "@ethersproject/transactions"
import {
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
import { getOrCreateDB, TrezorAccount, TrezorDatabase } from "./db"
import { ethersTransactionRequestFromEIP1559TransactionRequest } from "../chain/utils"
import { ETH } from "../../constants"
import { normalizeEVMAddress } from "../../lib/utils"
import { HIDE_IMPORT_TREZOR } from "../../features/features"

enum TrezorType {
  UNKNOWN,
  TREZOR_ONE,
  TREZOR_T,
}

const TrezorTypeAsString = Object.values(TrezorType)

export const isTrezorSupported =
  !HIDE_IMPORT_TREZOR && typeof navigator.usb === "object"

type MetaData = {
  ethereumVersion: string
  ethereumBlindSigner: boolean
}

export type ConnectedDevice = {
  id: string
  type: TrezorType
  metadata: MetaData
}

type Events = ServiceLifecycleEvents & {
  trezorAdded: {
    id: string
    type: TrezorType
    accountIDs: string[]
    metadata: MetaData
  }
  trezorAccountAdded: {
    id: string
    trezorID: string
    derivationPath: string
    addresses: HexString[]
  }
  connected: ConnectedDevice
  disconnected: { id: string; type: TrezorType }
  address: { trezorID: string; derivationPath: string; address: HexString }
  signedTransaction: SignedEVMTransaction
  signedData: string
  usbDeviceCount: number
}

export const idDerivationPath = "m44'/60'/0'/0/0"

async function deriveAddressOnTrezor(path: string) {
  const result = await TrezorConnect.ethereumGetAddress({
    path,
  })

  if (!result.success) {
    // throw new Error(result.payload.error)
    throw new Error("Error deriving on Trezor")
  }

  const derivedIdentifiers = result.payload.address
  const address = ethersGetAddress(derivedIdentifiers)
  return address
}

/**
 * The TrezorService is responsible for maintaining the connection
 * with a Trezor device.
 */
export default class TrezorService extends BaseService<Events> {
  #currentTrezorId: string | null = null

  #lastOperationPromise = Promise.resolve()

  static create: ServiceCreatorFunction<Events, TrezorService, []> =
    async () => {
      return new this(await getOrCreateDB())
    }

  private constructor(private db: TrezorDatabase) {
    super()
    //
    // QUESTION: Should we run TrezorConnect.manifest() here instead?
    //
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

  // TODO: Remove unused productId
  async onConnection(productId: number): Promise<void> {
    return this.runSerialized(async () => {
      const result = await TrezorConnect.getPublicKey({
        path: idDerivationPath,
        coin: "eth",
      })

      if (!result.success) {
        throw new Error("Error getPublicKey on trezor")
        // throw new Error(result.payload.error)
      }
      const id = result.payload.publicKey

      if (!id) {
        throw new Error("Can't derive meaningful identification address!")
      }
      const type = TrezorType.TREZOR_ONE

      // const appData = await eth.getAppConfiguration()
      // What does appData.version return ???
      // const version = appData.version
      const fakeVersion = "1.0"
      const blingSignerModel = true
      const normalizedID = normalizeEVMAddress(id)

      this.#currentTrezorId = `${TrezorTypeAsString[type]}_${normalizedID}`

      this.emitter.emit("connected", {
        id: this.#currentTrezorId,
        type,
        metadata: {
          ethereumVersion: fakeVersion,
          ethereumBlindSigner: blingSignerModel,
        },
      })

      const knownAddresses = await this.db.getAllAccountsByTrezorId(
        this.#currentTrezorId
      )

      if (!knownAddresses.length) {
        this.emitter.emit("trezorAdded", {
          id: this.#currentTrezorId,
          type,
          accountIDs: [idDerivationPath],
          metadata: {
            ethereumVersion: fakeVersion,
            ethereumBlindSigner: blingSignerModel,
          },
        })
      }
    })
  }

  #handleUSBConnect = async (event: USBConnectionEvent): Promise<void> => {
    this.emitter.emit(
      "usbDeviceCount",
      (await navigator.usb.getDevices()).length
    )
    logger.info("Emitted usbDeviceCount ", event.device.productId)
    this.onConnection(event.device.productId)
  }

  #handleUSBDisconnect = async (event: USBConnectionEvent): Promise<void> => {
    this.emitter.emit(
      "usbDeviceCount",
      (await navigator.usb.getDevices()).length
    )
    if (!this.#currentTrezorId) {
      return
    }

    this.emitter.emit("disconnected", {
      id: this.#currentTrezorId,
      type: TrezorType.TREZOR_ONE,
    })

    this.#currentTrezorId = null
  }

  protected async internalStartService(): Promise<void> {
    await super.internalStartService() // Not needed, but better to stick to the patterns

    this.refreshConnectedTrezor()

    TrezorConnect.on(DEVICE_EVENT, (event) => {
      if (event.type === DEVICE.CONNECT) {
        navigator.usb.addEventListener("connect", this.#handleUSBConnect)
      } else if (event.type === DEVICE.DISCONNECT) {
        navigator.usb.addEventListener("disconnect", this.#handleUSBDisconnect)
      }
    })

    // TODO: Review and remove if unneeded
    navigator.usb.addEventListener("connect", this.#handleUSBConnect)
    navigator.usb.addEventListener("disconnect", this.#handleUSBDisconnect)
  }

  protected async internalStopService(): Promise<void> {
    await super.internalStartService() // Not needed, but better to stick to the patterns

    navigator.usb.removeEventListener("disconnect", this.#handleUSBDisconnect)
    navigator.usb.removeEventListener("connect", this.#handleUSBConnect)
  }

  async refreshConnectedTrezor(): Promise<string | null> {
    const usbDeviceArray = await navigator.usb.getDevices()

    this.emitter.emit("usbDeviceCount", usbDeviceArray.length)

    if (usbDeviceArray.length === 0 || usbDeviceArray.length > 1) {
      return null // Nasty things may happen when we've got zero or multiple choices
    }

    if (usbDeviceArray.length === 1) {
      await this.onConnection(usbDeviceArray[0].productId)
    }

    return this.#currentTrezorId
  }

  async deriveAddress(accountID: string): Promise<HexString> {
    return this.runSerialized(async () => {
      try {
        if (!this.#currentTrezorId) {
          throw new Error("Uninitialized Trezor ID!")
        }

        const accountAddress = normalizeEVMAddress(
          // TODO: await deriveAddressOnTrezor(accountID)
          await deriveAddressOnTrezor(idDerivationPath)
        )

        this.emitter.emit("address", {
          trezorID: this.#currentTrezorId,
          derivationPath: accountID,
          address: accountAddress,
        })

        return accountAddress
      } catch (err) {
        logger.error(
          `Error encountered! trezorID: ${
            this.#currentTrezorId
          } accountID: ${accountID} error: ${err}`
        )
        throw err
      }
    })
  }

  async saveAddress(path: HexString, address: string): Promise<void> {
    if (!this.#currentTrezorId) {
      throw new Error("No Trezor id is set!")
    }

    await this.db.addAccount({ trezorId: this.#currentTrezorId, path, address })
  }

  async signTransaction(
    network: EVMNetwork,
    transactionRequest: EIP1559TransactionRequest & { nonce: number },
    deviceID: string,
    path: string
  ): Promise<SignedEVMTransaction> {
    return this.runSerialized(async () => {
      try {
        if (!this.#currentTrezorId) {
          throw new Error("Uninitialized Trezor ID!")
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

        // TODO: change
        const result = await TrezorConnect.ethereumSignTransaction({
          path: idDerivationPath,
          transaction: {
            to: transactionRequest.to!,
            value: "0xf4240",
            data: "0x01",
            chainId: 1,
            nonce: "0x0",
            gasLimit: "0x5208",
            gasPrice: "0xbebc200",
          },
        })

        /*
        const result = await TrezorConnect.ethereumSignTransaction({
          //path: idDerivationPath,
          //path: "m44'/60'/0'/0/0",
          path: "m/44'/60'/0'",
          transaction: {
              //from: transactionRequest.from,
              to: transactionRequest.to,
              // value: transactionRequest.value,
              value: "0xf4240",
              // data: transactionRequest
              //chainId: transactionRequest.chainID,
              chainId: 1,
              nonce: transactionRequest.nonce,
              gasLimit: transactionRequest.gasLimit,
              gasPrice: "0xbebc200"
          }
        });
        */

        if (!result.success) {
          // throw new Error(result.payload.error)
          throw new Error("Error TrezorConnect.ethereumSignTransaction")
        }

        const signature = result.payload

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
            this.#currentTrezorId
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
      if (!this.#currentTrezorId) {
        throw new Error("Uninitialized Trezor ID!")
      }

      const { EIP712Domain, ...typesForSigning } = typedData.types
      const hashedDomain = _TypedDataEncoder.hashDomain(typedData.domain)
      const hashedMessage = _TypedDataEncoder
        .from(typesForSigning)
        .hash(typedData.message)

      const accountData = await this.db.getAccountByAddress(account)

      this.checkCanSign(accountData, path, deviceID)

      // Example from https://github.com/trezor/connect/blob/develop/docs/methods/ethereumSignTypedData.md
      const eip712Data = {
        types: {
          EIP712Domain: [
            {
              name: "name",
              type: "string",
            },
          ],
          Message: [
            {
              name: "Best Wallet",
              type: "string",
            },
          ],
        },
        primaryType: "Message",
        domain: {
          name: "example.trezor.io",
        },
        message: {
          "Best Wallet": "Trezor Model T",
        },
      }

      // This functionality is separate from trezor-connect, as it requires @metamask/eth-sig-utils,
      // which is a large JavaScript dependency
      // const transformTypedDataPlugin = require("trezor-connect/lib/plugins/ethereum/typedData.js");
      // const {domain_separator_hash, message_hash} = transformTypedDataPlugin(eip712Data, true);

      /*
      const result = await TrezorConnect.ethereumSignTypedData({
        path: idDerivationPath,
        data: eip712Data,
        metamask_v4_compat: true,
        // These are optional, but required for Trezor Model 1 compatibility
        domain_separator_hash,
        message_hash,
      })

      if (!result.success) {
        //throw new Error(result.payload.error)
        throw new Error("Error on TrezorConnect.ethereumSignTypedData")
      }

      const { signature } = result.payload
      */

      const signature = "TODO"
      this.emitter.emit("signedData", signature)
      return signature
    })
  }

  private checkCanSign(
    accountData: TrezorAccount | null,
    path: string,
    deviceID: string
  ) {
    if (
      !accountData ||
      path !== accountData.path ||
      deviceID !== accountData.trezorId
    ) {
      throw new Error("Signing method mismatch!")
    }

    if (deviceID !== this.#currentTrezorId) {
      throw new Error("Cannot sign on wrong device attached!")
    }
  }

  async signMessage(address: string, message: string): Promise<string> {
    if (!this.#currentTrezorId) {
      throw new Error("Uninitialized Trezor ID!")
    }

    const result = await TrezorConnect.ethereumSignMessage({
      path: idDerivationPath,
      message,
    })

    if (!result.success) {
      // throw new Error(result.payload.error)
      throw new Error("Error on ethereumSignMessage (trezor)")
    }

    const { signature } = result.payload
    this.emitter.emit("signedData", signature)
    return signature
  }
}
