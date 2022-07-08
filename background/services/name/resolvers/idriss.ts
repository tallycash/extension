import { IdrissCrypto } from "idriss-crypto/lib/browser"
import { NameResolver } from "../name-resolver"
import { AddressOnNetwork, NameOnNetwork } from "../../../accounts"
import { normalizeEVMAddress } from "../../../lib/utils"

export default function idrissResolver(): NameResolver<"idriss"> {
  return {
    type: "idriss",
    canAttemptNameResolution(): boolean {
      return true
    },
    canAttemptAvatarResolution(): boolean {
      return false
    },
    canAttemptAddressResolution({ name }: NameOnNetwork): boolean {
      return IdrissCrypto.matchInput(name) !== null
    },
    async lookUpAddressForName({
      name,
      network,
    }: NameOnNetwork): Promise<AddressOnNetwork | undefined> {
      const resolver = new IdrissCrypto()
      const result = await resolver.resolve(name, { network: "evm" })
      const address = result["Public ETH"] ?? Object.values(result)[0]
      if (address) {
        const normalizedAddress = normalizeEVMAddress(address)
        const alternative = Object.entries(result).map(x=>({name:x[0], address:normalizeEVMAddress(x[1])}));
        return { address: normalizedAddress, network, alternative }
      }
      return undefined
    },
    async lookUpAvatar() {
      return undefined
    },
    async lookUpNameForAddress({
      address,
      network,
    }: AddressOnNetwork): Promise<NameOnNetwork | undefined> {
      const resolver = new IdrissCrypto()
      const result = await resolver.reverseResolve(address)
      if (result) {
        return { name: result, network }
      }
      return undefined
    },
  }
}
