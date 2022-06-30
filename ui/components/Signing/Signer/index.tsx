import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import { SignerType } from "@tallyho/tally-background/services/signing"
import { SigningFrame } from ".."
import SignerKeyringFrame from "./SignerKeyring/SignerKeyringFrame"
import SignerLedgerFrame from "./SignerLedger/SignerLedgerFrame"
import SignerReadOnlyFrame from "./SignerReadOnly/SignerReadOnlyFrame"

/**
 * For each available signer type, the frame that will wrap the signing data
 * data and own the signing flow.
 */
// eslint-disable-next-line import/prefer-default-export
export const frameComponentForSigner: {
  [signerType in SignerType]: SigningFrame<SignOperationType>
} = {
  keyring: SignerKeyringFrame,
  ledger: SignerLedgerFrame,
  "read-only": SignerReadOnlyFrame,
  // ... will error if a new SignerType is added without a corresponding frame
}
