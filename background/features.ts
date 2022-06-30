export const HIDE_IMPORT_DERIVATION_PATH =
  process.env.HIDE_IMPORT_DERIVATION_PATH === "true"
export const USE_MAINNET_FORK = process.env.USE_MAINNET_FORK === "true"
export const HIDE_SWAP_REWARDS = process.env.HIDE_SWAP_REWARDS === "true"
export const RESOLVE_RNS_NAMES = process.env.RESOLVE_RNS_NAMES === "true"
export const SUPPORT_POLYGON = process.env.SUPPORT_POLYGON === "true"
export const SUPPORT_ARBITRUM = process.env.SUPPORT_ARBITRUM === "true"
export const SUPPORT_OPTIMISM = process.env.SUPPORT_OPTIMISM === "true"
export const MULTI_NETWORK =
  SUPPORT_POLYGON || SUPPORT_ARBITRUM || SUPPORT_OPTIMISM
export const CUSTOM_GAS_SELECT = process.env.CUSTOM_GAS_SELECT === "true"
export const HIDE_TOKEN_FEATURES = process.env.HIDE_TOKEN_FEATURES === "true"
export const USE_UPDATED_SIGNING_UI =
  process.env.USE_UPDATED_SIGNING_UI === "true"
