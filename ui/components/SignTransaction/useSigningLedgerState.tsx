import { assertUnreachable } from "@tallyho/tally-background/lib/utils/type-guards"
import { AccountSigner } from "@tallyho/tally-background/services/signing"
import { HexString } from "@tallyho/tally-background/types"
import { useBackgroundSelector } from "../../hooks"

export type SigningLedgerState =
  | {
      state: "no-ledger-connected" | "busy" | "multiple-ledgers-connected"
    }
  | { state: "wrong-ledger-connected"; requiredAddress: HexString }
  | { state: "available"; arbitraryDataEnabled: boolean }

export function useSigningLedgerState(
  signingAddress: HexString | undefined,
  accountSigner: AccountSigner | null
): SigningLedgerState | null {
  return useBackgroundSelector((state) => {
    if (signingAddress === undefined || accountSigner?.type !== "ledger") {
      return null
    }

    const { deviceID } = accountSigner

    const connectedDevices = Object.values(state.ledger.devices).filter(
      (device) => device.status !== "disconnected"
    )
    if (connectedDevices.length === 0) return { state: "no-ledger-connected" }
    if (state.ledger.usbDeviceCount > 1)
      return { state: "multiple-ledgers-connected" }

    const device = state.ledger.devices[deviceID]

    switch (device.status) {
      case "available":
        return {
          state: "available",
          arbitraryDataEnabled: device?.isArbitraryDataSigningEnabled ?? false,
        }
      case "busy":
        return { state: "busy" }
      case "disconnected":
        return {
          state: "wrong-ledger-connected",
          requiredAddress: signingAddress,
        }
      default:
        return assertUnreachable(device.status)
    }
  })
}
