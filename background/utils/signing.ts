import { TypedDataField } from "@ethersproject/abstract-signer"
import { SiweMessage } from "siwe"

import { EIP191Data, EIP712TypedData, HexString } from "../types"

export type EIP712DomainType = {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: HexString
}

// spec found https://eips.ethereum.org/EIPS/eip-4361
export interface EIP4361Data {
  domain: string
  address: string
  version: string
  chainId: number
  nonce: string
  expiration?: string
  statement?: string
}

export type SignTypedDataRequest = {
  account: string
  typedData: EIP712TypedData
}

export type SigningMethod =
  | { type: "keyring"; keyringID: string | null }
  | { type: "ledger"; deviceID: string; path: string }

export type ExpectedSigningData = EIP191Data | EIP4361Data

export type SignDataRequest = {
  account: string
  rawSigningData: string
  signingData: ExpectedSigningData
  messageType: SignDataMessageType
}

export enum SignDataMessageType {
  EIP191 = 0,
  EIP4361 = 1,
}

type EIP2612Message = {
  owner: HexString
  spender: HexString
  value: number
  nonce: number
  deadline: number
}

export type EIP2612TypedData = {
  domain: EIP712DomainType
  types: Record<string, TypedDataField[]>
  message: EIP2612Message
  primaryType: "Permit"
  // FIXME Add network info.
}

const checkEIP4361: (message: string) => EIP4361Data | undefined = (
  message
) => {
  try {
    const siweMessage = new SiweMessage(message)
    return {
      domain: siweMessage.domain,
      address: siweMessage.address,
      statement: siweMessage.statement,
      version: siweMessage.version,
      chainId: siweMessage.chainId,
      expiration: siweMessage.expirationTime,
      nonce: siweMessage.nonce,
    }
  } catch (err) {
    // console.error(err)
  }

  return undefined
}

/**
 * Takes a string and parses the string into a ExpectedSigningData Type
 *
 * EIP4361 standard can be found https://eips.ethereum.org/EIPS/eip-4361
 */
export const parseSigningData: (signingData: string) => {
  data: ExpectedSigningData
  type: SignDataMessageType
} = (signingData) => {
  const data = checkEIP4361(signingData)
  if (data) {
    return {
      data,
      type: SignDataMessageType.EIP4361,
    }
  }

  // data = checkOtherType(lines)
  // if (!!data) {
  // return data
  // }

  // add additional checks for any other types to add in the future
  return {
    data: signingData,
    type: SignDataMessageType.EIP191,
  }
}
