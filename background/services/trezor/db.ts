import Dexie from "dexie"
import { normalizeEVMAddress } from "../../lib/utils"
import { HexString } from "../../types"

export interface TrezorAccount {
  trezorId: string
  address: HexString
  path: string
}

export class TrezorDatabase extends Dexie {
  private trezor!: Dexie.Table<TrezorAccount, number>

  constructor() {
    super("tally/trezor")

    this.version(1).stores({
      ledger: "&address,trezorId",
    })
  }

  async addAccount(account: TrezorAccount): Promise<void> {
    await this.trezor.add(account)
  }

  async getAccountByAddress(address: HexString): Promise<TrezorAccount | null> {
    return (
      (await this.trezor
        .where("address")
        .equals(normalizeEVMAddress(address))
        .first()) ?? null
    )
  }

  async getAllAccountsByTrezorId(trezorId: string): Promise<TrezorAccount[]> {
    return this.trezor.where("trezorId").equals(trezorId).toArray()
  }
}

export async function getOrCreateDB(): Promise<TrezorDatabase> {
  return new TrezorDatabase()
}
