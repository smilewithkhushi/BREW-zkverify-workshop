import type { NextApiRequest, NextApiResponse } from 'next'
import * as fs from 'fs'
import * as path from 'path'
import { ethers } from 'ethers'

type VerifyResponse =
  | { verified: boolean; attestationTxHash?: string }
  | { error: string }

// Minimal ABI — only the checkHash function
const CHECK_HASH_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'leaf', type: 'bytes32' },
      { internalType: 'uint256', name: 'aggregationId', type: 'uint256' },
      { internalType: 'uint256', name: 'domainId', type: 'uint256' },
      { internalType: 'bytes32[]', name: 'merklePath', type: 'bytes32[]' },
      { internalType: 'uint256', name: 'leafCount', type: 'uint256' },
      { internalType: 'uint256', name: 'index', type: 'uint256' },
    ],
    name: 'checkHash',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// ZKVerify proxy emits AttestationPosted(uint256 indexed attestationId, bytes32 indexed proofsAttestation)
// when it relays an aggregation root from Volta onto Sepolia.
const ZKVERIFY_PROXY_ABI = [
  'event AttestationPosted(uint256 indexed attestationId, bytes32 indexed proofsAttestation)',
]

const CONTRACT_ADDRESS  = '0x83AaEa8a0ace1c095F2cE28E862b78427e7efAca'
const ZKVERIFY_PROXY    = '0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E'
const SEPOLIA_RPC       = 'https://ethereum-sepolia-rpc.publicnode.com'

// Look up the Sepolia tx in which ZKVerify posted our aggregationId's attestation.
async function findAttestationTx(
  provider: ethers.JsonRpcProvider,
  aggregationId: string | number
): Promise<string | undefined> {
  try {
    const proxy = new ethers.Contract(ZKVERIFY_PROXY, ZKVERIFY_PROXY_ABI, provider)
    const filter = proxy.filters.AttestationPosted(BigInt(aggregationId))
    // Search recent blocks only — attestation is posted shortly before checkHash succeeds
    const latestBlock = await provider.getBlockNumber()
    const fromBlock   = Math.max(0, latestBlock - 50_000) // ~7 days of Sepolia blocks
    const logs        = await proxy.queryFilter(filter, fromBlock, 'latest')
    if (logs.length > 0) return logs[logs.length - 1].transactionHash
  } catch {
    // Non-critical — silently ignore if lookup fails
  }
  return undefined
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyResponse>
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const aggregationPath = path.join(process.cwd(), 'aggregation.json')

  if (!fs.existsSync(aggregationPath)) {
    res.status(400).json({ error: 'aggregation.json not found. Run submit first.' })
    return
  }

  let agg: Record<string, unknown>

  try {
    const raw = fs.readFileSync(aggregationPath, 'utf8')
    agg = JSON.parse(raw)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: `Failed to read aggregation.json: ${message}` })
    return
  }

  // Extract fields
  const leaf = agg.leaf as string | undefined
  const aggregationId = agg.aggregationId as string | number | undefined
  const domainId = agg.domainId as string | number | undefined
  const merklePath = (agg.proof as string[] | undefined) ?? (agg.merklePath as string[] | undefined) ?? []
  const leafCount = (agg.numberOfLeaves as string | number | undefined) ?? (agg.leafCount as string | number | undefined) ?? merklePath.length + 1
  const index = (agg.leafIndex as string | number | undefined) ?? (agg.index as string | number | undefined) ?? 0

  if (!leaf || aggregationId === undefined || domainId === undefined) {
    res.status(400).json({
      error: 'aggregation.json is missing required fields (leaf, aggregationId, domainId)',
    })
    return
  }

  // Poll until Sepolia has the attestation — the ZKVerify bridge posts it after
  // NewAggregationReceipt fires on Volta, which can take a few minutes.
  const MAX_ATTEMPTS = 20
  const POLL_INTERVAL_MS = 15_000

  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CHECK_HASH_ABI, provider)

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const verified: boolean = await contract.checkHash(
          leaf,
          BigInt(aggregationId),
          BigInt(domainId),
          merklePath,
          BigInt(leafCount),
          BigInt(index)
        )
        const attestationTxHash = verified
          ? await findAttestationTx(provider, aggregationId)
          : undefined
        res.status(200).json({ verified, attestationTxHash })
        return
      } catch (err: unknown) {
        const reason =
          err instanceof Error
            ? (err as Error & { reason?: string }).reason ?? err.message
            : String(err)

        const isNotYetAttested =
          reason === 'Invalid proof' ||
          reason.includes('Invalid proof') ||
          reason.includes('execution reverted')

        if (isNotYetAttested && attempt < MAX_ATTEMPTS) {
          // Attestation hasn't landed on Sepolia yet — wait and retry
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
          continue
        }

        // Non-retryable error or exhausted attempts
        res.status(500).json({
          error: `On-chain verification failed after ${attempt} attempt(s): ${reason}`,
        })
        return
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: `On-chain verification failed: ${message}` })
  }
}
