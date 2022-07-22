import { OffChainAsset } from "@tallyho/tally-background/assets";

export const STARTING_CAD_BALANCE = 100;
export const STARTING_ETH_BALANCE = 0.033;
export const DEFAULT_ASSETS: OffChainAsset[] = [
    {
        "accountId": "abc123",
        "currencySymbol": "CAD",
        "amount": STARTING_CAD_BALANCE,
        "label": "Alice's Chequing Account"
    },
    {
        "accountId": "abc123",
        "currencySymbol": "ETH",
        "amount": STARTING_ETH_BALANCE,
        "label": "Alice's Crypto Account"
    }
]