import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { StatusCodes, TransportStatusError } from "@ledgerhq/errors"
import KeyringService from "../keyring"
import LedgerService from "../ledger"
import {
  EIP1559TransactionRequest,
  EVMNetwork,
  SignedEVMTransaction,
} from "../../networks"
import { HexString } from "../../types"
import BaseService from "../base"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import ChainService from "../chain"
import { SigningMethod } from "../../redux-slices/signing"
import { normalizeEVMAddress } from "../../lib/utils"

export type SignatureResponse =
  | {
      type: "success"
      signedTx: SignedEVMTransaction
    }
  | {
      type: "error"
      reason: "userRejected" | "genericError"
    }

type Events = ServiceLifecycleEvents & {
  signingResponse: SignatureResponse
}

type SignerType = "keyring" | HardwareSignerType
type HardwareSignerType = "ledger"

type AddressHandler = {
  address: string
  signer: SignerType
}

type AccountSigner = {
  type: SignerType
  accountID: string
}

/**
 * The SigningService is responsible for
 *
 * The main purpose for this service/layer is
 *
 * The responsibility of this service is 2 fold.
 * - xxx
 */
export default class SigningService extends BaseService<Events> {
  addressHandlers: AddressHandler[] = []

  static create: ServiceCreatorFunction<
    Events,
    SigningService,
    [Promise<KeyringService>, Promise<LedgerService>, Promise<ChainService>]
  > = async (keyringService, ledgerService, chainService) => {
    return new this(
      await keyringService,
      await ledgerService,
      await chainService
    )
  }

  private constructor(
    private keyringService: KeyringService,
    private ledgerService: LedgerService,
    private chainService: ChainService
  ) {
    super()
  }

  protected async internalStartService(): Promise<void> {
    await super.internalStartService() // Not needed, but better to stick to the patterns
  }

  async deriveAddress(signerID: AccountSigner): Promise<HexString> {
    if (signerID.type === "ledger") {
      return this.ledgerService.deriveAddress(signerID.accountID)
    }

    if (signerID.type === "keyring") {
      return this.keyringService.deriveAddress(signerID.accountID)
    }

    throw new Error(`Unknown signerID: ${signerID}`)
  }

  private async signTransactionWithNonce(
    network: EVMNetwork,
    transactionWithNonce: EIP1559TransactionRequest & { nonce: number },
    signingMethod: SigningMethod
  ): Promise<SignedEVMTransaction> {
    switch (signingMethod.type) {
      case "ledger":
        return this.ledgerService.signTransaction(
          network,
          transactionWithNonce,
          signingMethod.deviceID,
          signingMethod.path
        )
      case "keyring":
        return this.keyringService.signTransaction(
          { address: normalizeEVMAddress(transactionWithNonce.from), network },
          transactionWithNonce
        )
      default:
        throw new Error(`Unreachable!`)
    }
  }

  async signTransaction(
    network: EVMNetwork,
    transactionRequest: EIP1559TransactionRequest,
    signingMethod: SigningMethod
  ): Promise<SignedEVMTransaction> {
    const transactionWithNonce =
      await this.chainService.populateEVMTransactionNonce(transactionRequest)

    try {
      const signedTx = await this.signTransactionWithNonce(
        network,
        transactionWithNonce,
        signingMethod
      )

      this.emitter.emit("signingResponse", {
        type: "success",
        signedTx,
      })

      return signedTx
    } catch (err) {
      if (err instanceof TransportStatusError) {
        const transportError = err as Error & { statusCode: number }
        switch (transportError.statusCode) {
          case StatusCodes.CONDITIONS_OF_USE_NOT_SATISFIED:
            this.emitter.emit("signingResponse", {
              type: "error",
              reason: "userRejected",
            })
            throw err
          default:
            break
        }
      }

      this.emitter.emit("signingResponse", {
        type: "error",
        reason: "genericError",
      })

      throw err
    } finally {
      this.chainService.releaseEVMTransactionNonce(transactionWithNonce)
    }
  }

  addTrackedAddress(address: string, handler: SignerType): void {
    this.addressHandlers.push({
      address: normalizeEVMAddress(address),
      signer: handler,
    })
  }

  async signTypedData(
    address: string,
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string> {
    this.signTypedData = this.signTypedData.bind(this)

    throw new Error("Unimplemented")
  }

  async signMessage(address: string, message: string): Promise<string> {
    this.signMessage = this.signMessage.bind(this)

    throw new Error("Unimplemented")
  }
}
