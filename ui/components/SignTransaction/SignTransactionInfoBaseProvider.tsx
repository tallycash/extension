import { EIP1559TransactionRequest } from "@tallyho/tally-background/networks"
import { EnrichedEIP1559TransactionRequest } from "@tallyho/tally-background/services/enrichment"
import { TransactionDescription } from "ethers/lib/utils"
import { ReactElement, ReactNode } from "react"

export interface SignTransactionInfo {
  title: ReactNode
  infoBlock: ReactNode
  textualInfoBlock: ReactNode
  confirmButtonLabel: ReactNode
}

export interface SignTransactionInfoProviderProps {
  transactionDetails:
    | EIP1559TransactionRequest
    | EnrichedEIP1559TransactionRequest
  parsedTx: TransactionDescription | undefined
  inner: (info: SignTransactionInfo) => ReactElement
}

export default function SignTransactionBaseInfoProvider({
  inner,
  ...info
}: SignTransactionInfo & {
  inner: (info: SignTransactionInfo) => ReactElement
}): ReactElement {
  return inner(info)
}
