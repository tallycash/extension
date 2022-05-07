import { createSelector, OutputSelector } from "@reduxjs/toolkit"
import { RootState } from ".."
import { Keyring } from "../../services/keyring"

export const selectKeyringStatus = createSelector(
  (state: RootState) => state.keyrings.status,
  (status) => status
)

export const selectKeyrings = createSelector(
  (state: RootState) => state.keyrings.keyrings,
  (keyrings) => keyrings
)

export const selectKeyringByAddress = (
  address: string
): OutputSelector<
  RootState,
  Keyring | undefined,
  (res: Keyring[]) => Keyring | undefined
> =>
  createSelector(
    [(state: RootState) => state.keyrings.keyrings],
    (keyrings) => {
      const kr = keyrings.find((keyring) => keyring.addresses.includes(address))
      return kr
    }
  )

export const selectKeyringSigningAddresses = createSelector(
  (state: RootState) => state.keyrings.keyrings,
  (keyrings) => keyrings.flatMap((keyring) => keyring.addresses)
)

export const selectKeyringsByAddresses = createSelector(
  (state: RootState) => state.keyrings.keyrings,
  (
    keyrings
  ): {
    [keyringId: string]: Keyring
  } =>
    Object.fromEntries(
      keyrings.flatMap((keyring) =>
        keyring.addresses.map((address) => [address, keyring])
      )
    )
)

export const selectSourcesByAddress = createSelector(
  (state: RootState) => state.keyrings.keyrings,
  (state: RootState) => state.keyrings.keyringMetadata,
  (
    keyrings,
    keyringMetadata
  ): {
    [keyringId: string]: "import" | "internal"
  } =>
    Object.fromEntries(
      keyrings
        // get rid of "Loading" keyrings
        .filter((keyring) => !!keyring.id)
        .flatMap((keyring) =>
          keyring.addresses.map((address) => [
            address,
            // Guaranteed to exist by the filter above
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            keyringMetadata[keyring.id!]?.source,
          ])
        )
    )
)
