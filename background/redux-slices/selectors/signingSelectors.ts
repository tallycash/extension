import { createSelector } from "@reduxjs/toolkit"
import { RootState } from ".."
import { SigningMethod } from "../../utils/signing"
import { selectKeyrings } from "./keyringsSelectors"
import { selectLedgerSigningMethodEntries } from "./ledgerSelectors"
import { selectCurrentAccount } from "./uiSelectors"

export const selectAddressSigningMethods = createSelector(
  selectKeyrings,
  selectLedgerSigningMethodEntries,
  (signingKeyrings, ledgerSigningMethodEntries) =>
    Object.fromEntries([
      ...ledgerSigningMethodEntries,
      // Give priority to keyring over Ledger, if an address is signable by both.
      // TODO: check this is the intended behavior
      ...signingKeyrings.flatMap((keyring) =>
        keyring.addresses.map((address) => [
          address,
          { type: "keyring", keyringID: keyring.id },
        ])
      ),
    ])
)

export const selectCurrentAccountSigningMethod = createSelector(
  selectAddressSigningMethods,
  (state: RootState) => selectCurrentAccount(state),
  (signingAccounts, selectedAccount): SigningMethod | null =>
    signingAccounts[selectedAccount.address] ?? null
)
