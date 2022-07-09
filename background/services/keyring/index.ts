import { parse as parseRawTransaction } from "@ethersproject/transactions"

import HDKeyring, { SerializedHDKeyring } from "@tallyho/hd-keyring"

import { normalizeEVMAddress } from "../../lib/utils"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import { getEncryptedVaults, writeLatestEncryptedVault } from "./storage"
import {
  decryptVault,
  deriveSymmetricKeyFromPassword,
  encryptVault,
  SaltedKey,
} from "./encryption"
import {
  HexString,
  KeyringTypes,
  EIP191Data,
  EIP712TypedData,
  UNIXTime,
} from "../../types"
import { EIP1559TransactionRequest, SignedEVMTransaction } from "../../networks"
import BaseService from "../base"
import { FORK, MINUTE } from "../../constants"
import { ethersTransactionRequestFromEIP1559TransactionRequest } from "../chain/utils"
import { USE_MAINNET_FORK } from "../../features"
import { AddressOnNetwork } from "../../accounts"
import logger from "../../lib/logger"

export const MAX_KEYRING_IDLE_TIME = 60 * MINUTE
export const MAX_OUTSIDE_IDLE_TIME = 60 * MINUTE

export type Keyring = {
  type: KeyringTypes
  id: string | null
  addresses: string[]
}

export type KeyringAccountSigner = {
  type: "keyring"
  keyringID: string
}

export interface KeyringMetadata {
  source: "import" | "internal"
}

interface SerializedKeyringData {
  keyrings: SerializedHDKeyring[]
  metadata: { [keyringId: string]: KeyringMetadata }
  hiddenAccounts: { [address: HexString]: boolean }
}

interface Events extends ServiceLifecycleEvents {
  locked: boolean
  keyrings: {
    keyrings: Keyring[]
    keyringMetadata: {
      [keyringId: string]: KeyringMetadata
    }
  }
  address: string
  // TODO message was signed
  signedTx: SignedEVMTransaction
  signedData: string
}

/*
 * KeyringService is responsible for all key material, as well as applying the
 * material to sign messages, sign transactions, and derive child keypairs.
 *
 * The service can be in two states, locked or unlocked, and starts up locked.
 * Keyrings are persisted in encrypted form when the service is locked.
 *
 * When unlocked, the service automatically locks itself after it has not seen
 * activity for a certain amount of time. The service can be notified of
 * outside activity that should be considered for the purposes of keeping the
 * service unlocked. No keyring activity for 30 minutes causes the service to
 * lock, while no outside activity for 30 minutes has the same effect.
 */
export default class KeyringService extends BaseService<Events> {
  #cachedKey: SaltedKey | null = null

  #keyrings: HDKeyring[] = []

  #keyringMetadata: { [keyringId: string]: KeyringMetadata } = {}

  #hiddenAccounts: { [address: HexString]: boolean } = {}

  /**
   * The last time a keyring took an action that required the service to be
   * unlocked (signing, adding a keyring, etc).
   */
  lastKeyringActivity: UNIXTime | undefined

  /**
   * The last time the keyring was notified of an activity outside of the
   * keyring. {@see markOutsideActivity}
   */
  lastOutsideActivity: UNIXTime | undefined

  static create: ServiceCreatorFunction<Events, KeyringService, []> =
    async () => {
      return new this()
    }

  private constructor() {
    super({
      autolock: {
        schedule: {
          periodInMinutes: 1,
        },
        handler: () => {
          this.autolockIfNeeded()
        },
      },
    })
  }

  async internalStartService(): Promise<void> {
    // Emit locked status on startup. Should always be locked, but the main
    // goal is to have external viewers synced to internal state no matter what
    // it is. Don't emit if there are no keyrings to unlock.
    await super.internalStartService()
    if ((await getEncryptedVaults()).vaults.length > 0) {
      this.emitter.emit("locked", this.locked())
    }
  }

  async internalStopService(): Promise<void> {
    await this.lock()

    await super.internalStopService()
  }

  /**
   * @return True if the keyring is locked, false if it is unlocked.
   */
  locked(): boolean {
    return this.#cachedKey === null
  }

  /**
   * Update activity timestamps and emit unlocked event.
   */
  #unlock(): void {
    this.lastKeyringActivity = Date.now()
    this.lastOutsideActivity = Date.now()
    this.emitter.emit("locked", false)
  }

  /**
   * Unlock the keyring with a provided password, initializing from the most
   * recently persisted keyring vault if one exists.
   *
   * @param password A user-chosen string used to encrypt keyring vaults.
   *        Unlocking will fail if an existing vault is found, and this password
   *        can't decrypt it.
   *
   *        Note that losing this password means losing access to any key
   *        material stored in a vault.
   * @param ignoreExistingVaults If true, ignore any existing, previously
   *        persisted vaults on unlock, instead starting with a clean slate.
   *        This option makes sense if a user has lost their password, and needs
   *        to generate a new keyring.
   *
   *        Note that old vaults aren't deleted, and can still be recovered
   *        later in an emergency.
   * @returns true if the service was successfully unlocked using the password,
   *          and false otherwise.
   */
  async unlock(
    password: string,
    ignoreExistingVaults = false
  ): Promise<boolean> {
    if (!this.locked()) {
      logger.warn("KeyringService is already unlocked!")
      this.#unlock()
      return true
    }

    if (!ignoreExistingVaults) {
      const { vaults } = await getEncryptedVaults()
      const currentEncryptedVault = vaults.slice(-1)[0]?.vault
      if (currentEncryptedVault) {
        // attempt to load the vault
        const saltedKey = await deriveSymmetricKeyFromPassword(
          password,
          currentEncryptedVault.salt
        )
        let plainTextVault: SerializedKeyringData
        try {
          plainTextVault = await decryptVault<SerializedKeyringData>(
            currentEncryptedVault,
            saltedKey
          )
          this.#cachedKey = saltedKey
        } catch (err) {
          // if we weren't able to load the vault, don't unlock
          return false
        }
        // hooray! vault is loaded, import any serialized keyrings
        this.#keyrings = []
        this.#keyringMetadata = {}
        plainTextVault.keyrings.forEach((kr) => {
          this.#keyrings.push(HDKeyring.deserialize(kr))
        })

        this.#keyringMetadata = {
          ...plainTextVault.metadata,
        }

        this.#hiddenAccounts = {
          ...plainTextVault.hiddenAccounts,
        }

        this.emitKeyrings()
      }
    }

    // if there's no vault or we want to force a new vault, generate a new key
    // and unlock
    if (!this.#cachedKey) {
      this.#cachedKey = await deriveSymmetricKeyFromPassword(password)
      await this.persistKeyrings()
    }

    this.#unlock()
    return true
  }

  /**
   * Lock the keyring service, deleting references to the cached vault
   * encryption key and keyrings.
   */
  async lock(): Promise<void> {
    this.lastKeyringActivity = undefined
    this.lastOutsideActivity = undefined
    this.#cachedKey = null
    this.#keyrings = []
    this.#keyringMetadata = {}
    this.emitter.emit("locked", true)
    this.emitKeyrings()
  }

  /**
   * Notifies the keyring that an outside activity occurred. Outside activities
   * are used to delay autolocking.
   */
  markOutsideActivity(): void {
    if (typeof this.lastOutsideActivity !== "undefined") {
      this.lastOutsideActivity = Date.now()
    }
  }

  // Locks the keyring if the time since last keyring or outside activity
  // exceeds preset levels.
  private async autolockIfNeeded(): Promise<void> {
    if (
      typeof this.lastKeyringActivity === "undefined" ||
      typeof this.lastOutsideActivity === "undefined"
    ) {
      // Normally both activity counters should be undefined only if the keyring
      // is locked, otherwise they should both be set; regardless, fail safe if
      // either is undefined and the keyring is unlocked.
      if (!this.locked()) {
        await this.lock()
      }

      return
    }

    const now = Date.now()
    const timeSinceLastKeyringActivity = now - this.lastKeyringActivity
    const timeSinceLastOutsideActivity = now - this.lastOutsideActivity

    if (timeSinceLastKeyringActivity >= MAX_KEYRING_IDLE_TIME) {
      this.lock()
    } else if (timeSinceLastOutsideActivity >= MAX_OUTSIDE_IDLE_TIME) {
      this.lock()
    }
  }

  // Throw if the keyring is not unlocked; if it is, update the last keyring
  // activity timestamp.
  private requireUnlocked(): void {
    if (this.locked()) {
      throw new Error("KeyringService must be unlocked.")
    }

    this.lastKeyringActivity = Date.now()
    this.markOutsideActivity()
  }

  // ///////////////////////////////////////////
  // METHODS THAT REQUIRE AN UNLOCKED SERVICE //
  // ///////////////////////////////////////////

  /**
   * Generate a new keyring
   *
   * @param type - the type of keyring to generate. Currently only supports 256-
   *        bit HD keys.
   * @returns An object containing the string ID of the new keyring and the
   *          mnemonic for the new keyring. Note that the mnemonic can only be
   *          accessed at generation time through this return value.
   */
  async generateNewKeyring(
    type: KeyringTypes
  ): Promise<{ id: string; mnemonic: string[] }> {
    this.requireUnlocked()

    if (type !== KeyringTypes.mnemonicBIP39S256) {
      throw new Error(
        "KeyringService only supports generating 256-bit HD key trees"
      )
    }

    const newKeyring = new HDKeyring({ strength: 256 })

    const { mnemonic } = newKeyring.serializeSync()

    return { id: newKeyring.id, mnemonic: mnemonic.split(" ") }
  }

  /**
   * Import keyring and pull the first address from that
   * keyring for system use.
   *
   * @param mnemonic - a seed phrase
   * @param source - original source of the key
   * @param path - derivation path
   * @param passphrase - optional passphrase [BIP39]
   * @returns The string ID of the new keyring.
   */
  async importKeyring(
    mnemonic: string,
    source: "import" | "internal",
    path?: string,
    passphrase?: string
  ): Promise<string> {
    this.requireUnlocked()

    const newKeyring = path
      ? new HDKeyring({ mnemonic, path, passphrase })
      : new HDKeyring({ mnemonic, passphrase })

    if (this.#keyrings.some((kr) => kr.id === newKeyring.id)) {
      return newKeyring.id
    }
    this.#keyrings.push(newKeyring)
    const [address] = newKeyring.addAddressesSync(1)
    this.#keyringMetadata[newKeyring.id] = { source }
    await this.persistKeyrings()
    this.emitter.emit("address", address)
    this.emitKeyrings()
    return newKeyring.id
  }

  /**
   * Return an array of keyring representations that can safely be stored and
   * used outside the extension.
   */
  getKeyrings(): Keyring[] {
    this.requireUnlocked()

    return this.#keyrings.map((kr) => ({
      // TODO this type is meanlingless from the library's perspective.
      // Reconsider, or explicitly track which keyrings have been generated vs
      // imported as well as their strength
      type: KeyringTypes.mnemonicBIP39S256,
      addresses: [
        ...kr
          .getAddressesSync()
          .filter((address) => this.#hiddenAccounts[address] !== true),
      ],
      id: kr.id,
    }))
  }

  /**
   * Derive and return the next address for a KeyringAccountSigner representing
   * an HDKeyring.
   *
   * @param keyringAccountSigner - A KeyringAccountSigner representing the
   *        given keyring.
   */
  async deriveAddress({ keyringID }: KeyringAccountSigner): Promise<HexString> {
    this.requireUnlocked()

    // find the keyring using a linear search
    const keyring = this.#keyrings.find((kr) => kr.id === keyringID)
    if (!keyring) {
      throw new Error("Keyring not found.")
    }

    const keyringAddresses = keyring.getAddressesSync()

    // If There are any hidden addresses, show those first before adding new ones.
    const newAddress =
      keyringAddresses.find(
        (address) => this.#hiddenAccounts[address] === true
      ) ?? keyring.addAddressesSync(1)[0]

    this.#hiddenAccounts[newAddress] = false

    await this.persistKeyrings()

    this.emitter.emit("address", newAddress)
    this.emitKeyrings()

    return newAddress
  }

  async hideAccount(address: HexString): Promise<void> {
    this.#hiddenAccounts[address] = true
    const keyring = await this.#findKeyring(address)
    const keyringAddresses = await keyring.getAddresses()
    if (
      keyringAddresses.every(
        (keyringAddress) => this.#hiddenAccounts[keyringAddress] === true
      )
    ) {
      keyringAddresses.forEach((keyringAddress) => {
        delete this.#hiddenAccounts[keyringAddress]
      })
      this.#removeKeyring(keyring.id)
    }
    await this.persistKeyrings()
    this.emitKeyrings()
  }

  #removeKeyring(keyringId: string): HDKeyring[] {
    const filteredKeyrings = this.#keyrings.filter(
      (keyring) => keyring.id !== keyringId
    )

    if (filteredKeyrings.length === this.#keyrings.length) {
      throw new Error(
        `Attempting to remove keyring that does not exist. id: (${keyringId})`
      )
    }
    this.#keyrings = filteredKeyrings
    return filteredKeyrings
  }

  /**
   * Find keyring associated with an account.
   *
   * @param account - the account desired to search the keyring for.
   */
  async #findKeyring(account: HexString): Promise<HDKeyring> {
    const keyring = this.#keyrings.find((kr) =>
      kr.getAddressesSync().includes(normalizeEVMAddress(account))
    )
    if (!keyring) {
      throw new Error("Address keyring not found.")
    }
    return keyring
  }

  /**
   * Sign a transaction.
   *
   * @param account - the account desired to sign the transaction
   * @param txRequest -
   */
  async signTransaction(
    addressOnNetwork: AddressOnNetwork,
    txRequest: EIP1559TransactionRequest & { nonce: number }
  ): Promise<SignedEVMTransaction> {
    this.requireUnlocked()

    const { address: account, network } = addressOnNetwork

    // find the keyring using a linear search
    const keyring = await this.#findKeyring(account)

    // ethers has a looser / slightly different request type
    const ethersTxRequest =
      ethersTransactionRequestFromEIP1559TransactionRequest(txRequest)
    // unfortunately, ethers gives us a serialized signed tx here
    const signed = await keyring.signTransaction(account, ethersTxRequest)

    // parse the tx, then unpack it as best we can
    const tx = parseRawTransaction(signed)

    if (!tx.hash || !tx.from || !tx.r || !tx.s || typeof tx.v === "undefined") {
      throw new Error("Transaction doesn't appear to have been signed.")
    }

    if (
      typeof tx.maxPriorityFeePerGas === "undefined" ||
      typeof tx.maxFeePerGas === "undefined" ||
      tx.type !== 2
    ) {
      throw new Error("Can only sign EIP-1559 conforming transactions")
    }

    // TODO move this to a helper function
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
      asset: network.baseAsset,
      network: USE_MAINNET_FORK ? FORK : network,
    }

    return signedTx
  }
  /**
   * Sign typed data based on EIP-712 with the usage of eth_signTypedData_v4 method,
   * more information about the EIP can be found at https://eips.ethereum.org/EIPS/eip-712
   *
   * @param typedData - the data to be signed
   * @param account - signers account address
   */

  async signTypedData({
    typedData,
    account,
  }: {
    typedData: EIP712TypedData
    account: HexString
  }): Promise<string> {
    this.requireUnlocked()
    const { domain, types, message } = typedData
    // find the keyring using a linear search
    const keyring = await this.#findKeyring(account)
    // When signing we should not include EIP712Domain type
    const { EIP712Domain, ...typesForSigning } = types
    try {
      const signature = await keyring.signTypedData(
        account,
        domain,
        typesForSigning,
        message
      )

      return signature
    } catch (error) {
      throw new Error("Signing data failed")
    }
  }

  /**
   * Sign data based on EIP-191 with the usage of personal_sign method,
   * more information about the EIP can be found at https://eips.ethereum.org/EIPS/eip-191
   *
   * @param signingData - the data to be signed
   * @param account - signers account address
   */

  async personalSign({
    signingData,
    account,
  }: {
    signingData: EIP191Data
    account: HexString
  }): Promise<string> {
    this.requireUnlocked()
    // find the keyring using a linear search
    const keyring = await this.#findKeyring(account)
    try {
      const signature = await keyring.signMessage(account, signingData)

      return signature
    } catch (error) {
      throw new Error("Signing data failed")
    }
  }

  // //////////////////
  // PRIVATE METHODS //
  // //////////////////

  private emitKeyrings() {
    if (this.locked()) {
      this.emitter.emit("keyrings", { keyrings: [], keyringMetadata: {} })
    } else {
      const keyrings = this.getKeyrings()
      this.emitter.emit("keyrings", {
        keyrings,
        keyringMetadata: { ...this.#keyringMetadata },
      })
    }
  }

  /**
   * Serialize, encrypt, and persist all HDKeyrings.
   */
  private async persistKeyrings() {
    this.requireUnlocked()

    // This if guard will always pass due to requireUnlocked, but statically
    // prove it to TypeScript.
    if (this.#cachedKey !== null) {
      const serializedKeyrings = this.#keyrings.map((kr) => kr.serializeSync())
      const hiddenAccounts = { ...this.#hiddenAccounts }
      const keyringMetadata = { ...this.#keyringMetadata }
      serializedKeyrings.sort((a, b) => (a.id > b.id ? 1 : -1))
      const vault = await encryptVault(
        {
          keyrings: serializedKeyrings,
          metadata: keyringMetadata,
          hiddenAccounts,
        },
        this.#cachedKey
      )
      await writeLatestEncryptedVault(vault)
    }
  }
}
