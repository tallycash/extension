import { BigNumber } from "ethers"
import {
  Block as EthersBlock,
  TransactionReceipt as EthersTransactionReceipt,
  TransactionRequest as EthersTransactionRequest,
} from "@ethersproject/abstract-provider"
import { Transaction as EthersTransaction } from "@ethersproject/transactions"

import {
  AnyEVMTransaction,
  EVMNetwork,
  SignedEVMTransaction,
  AnyEVMBlock,
  EIP1559TransactionRequest,
  ConfirmedEVMTransaction,
} from "../../networks"
import { FungibleAsset } from "../../assets"
import { normalizeEVMAddress } from "../../lib/utils"

/**
 * Parse a block as returned by a polling provider.
 */
export function blockFromEthersBlock(
  network: EVMNetwork,
  gethResult: EthersBlock
): AnyEVMBlock {
  return {
    hash: normalizeEVMAddress(gethResult.hash),
    blockHeight: gethResult.number,
    parentHash: normalizeEVMAddress(gethResult.parentHash),
    // FIXME Hold for ethers/v5.4.8 _difficulty BigNumber field; the current
    // FIXME difficutly field is a `number` and has overflowed since Ethereum
    // FIXME difficulty has exceeded MAX_SAFE_INTEGER. The current ethers
    // FIXME version devolves to `null` in that scenario, and does not reflect
    // FIXME in its type. The upcoming release will have a BigNumber
    // FIXME _difficulty field.
    difficulty: 0n,
    timestamp: gethResult.timestamp,
    baseFeePerGas: gethResult.baseFeePerGas?.toBigInt(),
    network,
  }
}

/**
 * Parse a block as returned by a websocket provider subscription.
 */
export function blockFromWebsocketBlock(
  network: EVMNetwork,
  incomingGethResult: unknown
): AnyEVMBlock {
  const gethResult = incomingGethResult as {
    hash: string
    number: string
    parentHash: string
    difficulty: string
    timestamp: string
    baseFeePerGas?: string
  }

  return {
    hash: normalizeEVMAddress(gethResult.hash),
    blockHeight: BigNumber.from(gethResult.number).toNumber(),
    parentHash: normalizeEVMAddress(gethResult.parentHash),
    difficulty: BigInt(gethResult.difficulty),
    timestamp: BigNumber.from(gethResult.timestamp).toNumber(),
    baseFeePerGas: gethResult.baseFeePerGas
      ? BigInt(gethResult.baseFeePerGas)
      : undefined,
    network,
  }
}

export function ethersTransactionRequestFromEIP1559TransactionRequest(
  transaction: EIP1559TransactionRequest
): EthersTransactionRequest {
  return {
    to:
      transaction.to != null
        ? normalizeEVMAddress(transaction.to)
        : transaction.to,
    data: transaction.input ?? undefined,
    from:
      transaction.from != null
        ? normalizeEVMAddress(transaction.from)
        : transaction.from,
    type: transaction.type,
    nonce: transaction.nonce,
    value: transaction.value,
    chainId: parseInt(transaction.chainID, 10),
    gasLimit: transaction.gasLimit,
    maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
  }
}

export function eip1559TransactionRequestFromEthersTransactionRequest(
  transaction: EthersTransactionRequest
): Partial<EIP1559TransactionRequest> {
  // TODO What to do if transaction is not EIP1559?
  return {
    to:
      transaction.to != null
        ? normalizeEVMAddress(transaction.to)
        : transaction.to,
    input: transaction.data?.toString() ?? null,
    from:
      transaction.from != null
        ? normalizeEVMAddress(transaction.from)
        : transaction.from,
    type: transaction.type as 1 | 2,
    nonce:
      typeof transaction.nonce !== "undefined"
        ? parseInt(transaction.nonce.toString(), 16)
        : undefined,
    value:
      typeof transaction.value !== "undefined"
        ? BigInt(transaction.value.toString())
        : undefined,
    chainID: transaction.chainId?.toString(16),
    gasLimit:
      typeof transaction.gasLimit !== "undefined"
        ? BigInt(transaction.gasLimit.toString())
        : undefined,
    maxFeePerGas:
      typeof transaction.maxFeePerGas !== "undefined"
        ? BigInt(transaction.maxFeePerGas.toString())
        : undefined,
    maxPriorityFeePerGas:
      typeof transaction.maxPriorityFeePerGas !== "undefined"
        ? BigInt(transaction.maxPriorityFeePerGas.toString())
        : undefined,
  }
}

export function ethersTransactionFromSignedTransaction(
  tx: SignedEVMTransaction
): EthersTransaction {
  const baseTx = {
    nonce: Number(tx.nonce),
    maxFeePerGas: tx.maxFeePerGas ? BigNumber.from(tx.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigNumber.from(tx.maxPriorityFeePerGas)
      : undefined,
    to: tx.to != null ? normalizeEVMAddress(tx.to) : tx.to,
    from: tx.from != null ? normalizeEVMAddress(tx.from) : tx.from,
    data: tx.input || "",
    type: tx.type,
    chainId: parseInt(tx.network.chainID, 10),
    value: BigNumber.from(tx.value),
    gasLimit: BigNumber.from(tx.gasLimit),
  }

  return {
    ...baseTx,
    r: tx.r,
    s: tx.s,
    v: tx.v,
  }
}

/**
 * Parse a transaction as returned by a websocket provider subscription.
 */
export function enrichTransactionWithReceipt(
  transaction: AnyEVMTransaction,
  receipt: EthersTransactionReceipt
): ConfirmedEVMTransaction {
  const gasUsed = receipt.gasUsed.toBigInt()

  return {
    ...transaction,
    gasUsed,
    gasPrice: receipt.effectiveGasPrice.toBigInt(),
    logs: receipt.logs.map(({ address, data, topics }) => ({
      contractAddress: address,
      data,
      topics,
    })),
    status:
      receipt.status ??
      // Pre-Byzantium transactions require a guesswork approach or an
      // eth_call; we go for guesswork.
      (gasUsed === transaction.gasLimit ? 0 : 1),
    blockHash: normalizeEVMAddress(receipt.blockHash),
    blockHeight: receipt.blockNumber,
  }
}

/**
 * Parse a transaction as returned by a polling provider.
 */
export function transactionFromEthersTransaction(
  tx: EthersTransaction & {
    from: string
    blockHash?: string
    blockNumber?: number
    type?: number | null
  },
  asset: FungibleAsset,
  network: EVMNetwork
): AnyEVMTransaction {
  if (tx.hash === undefined) {
    throw Error("Malformed transaction")
  }
  if (tx.type !== 0 && tx.type !== 1 && tx.type !== 2) {
    throw Error(`Unknown transaction type ${tx.type}`)
  }

  const newTx = {
    hash: tx.hash != null ? normalizeEVMAddress(tx.hash) : tx.hash,
    from: tx.from != null ? normalizeEVMAddress(tx.from) : tx.from,
    to: tx.to != null ? normalizeEVMAddress(tx.to) : tx.to,
    nonce: parseInt(tx.nonce.toString(), 10),
    gasLimit: tx.gasLimit.toBigInt(),
    gasPrice: tx.gasPrice ? tx.gasPrice.toBigInt() : null,
    maxFeePerGas: tx.maxFeePerGas ? tx.maxFeePerGas.toBigInt() : null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? tx.maxPriorityFeePerGas.toBigInt()
      : null,
    value: tx.value.toBigInt(),
    input: tx.data,
    type: tx.type,
    blockHash: tx.blockHash != null ? normalizeEVMAddress(tx.blockHash) : null,
    blockHeight: tx.blockNumber || null,
    network,
    asset,
  } as const // narrow types for compatiblity with our internal ones

  if (tx.r && tx.s && tx.v) {
    const signedTx: SignedEVMTransaction = {
      ...newTx,
      r: tx.r,
      s: tx.s,
      v: tx.v,
    }
    return signedTx
  }
  return newTx
}
