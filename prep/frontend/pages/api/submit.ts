import type { NextApiRequest, NextApiResponse } from 'next'
import * as fs from 'fs'
import * as path from 'path'

// SSE helper
function sendEvent(res: NextApiResponse, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  // @ts-expect-error flush exists on compressed responses
  if (typeof res.flush === 'function') res.flush()
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).end('Method not allowed')
    return
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.status(200)

  const circuitDir = path.resolve(process.cwd(), '..', 'magic_square')
  const proofPath = path.join(circuitDir, 'target', 'proof')
  const vkPath = path.join(circuitDir, 'target', 'vk')
  const aggregationOutputPath = path.join(process.cwd(), 'aggregation.json')

  // Read proof and vk binary files
  let proofHex: string
  let vkHex: string

  try {
    const proofBuf = fs.readFileSync(proofPath)
    const vkBuf = fs.readFileSync(vkPath)
    proofHex = '0x' + proofBuf.toString('hex')
    vkHex = '0x' + vkBuf.toString('hex')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    sendEvent(res, { step: 'error', message: `Failed to read proof/vk: ${message}` })
    res.end()
    return
  }

  // Dynamically import zkverifyjs (ESM package)
  let zkVerifySession: unknown
  let ZkVerifyEvents: unknown
  let UltrahonkVariant: unknown

  try {
    const zkverify = await import('zkverifyjs')
    zkVerifySession = zkverify.zkVerifySession
    ZkVerifyEvents = zkverify.ZkVerifyEvents
    UltrahonkVariant = zkverify.UltrahonkVariant
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    sendEvent(res, { step: 'error', message: `Failed to load zkverifyjs: ${message}` })
    res.end()
    return
  }

  const seedPhrase = process.env.SEED_PHRASE
  if (!seedPhrase) {
    sendEvent(res, { step: 'error', message: 'SEED_PHRASE env variable is not set' })
    res.end()
    return
  }

  try {
    sendEvent(res, { step: 'connecting' })

    // Start zkVerify session
    // @ts-expect-error dynamic import typing
    const session = await zkVerifySession.start().Volta().withAccount(seedPhrase)

    sendEvent(res, { step: 'submitting' })

    // These are set by IncludedInBlock and used by the aggregation receipt callback
    let statement: unknown
    let aggregationId: number | undefined

    // Subscribe to aggregation receipts BEFORE submitting (same pattern as proof-submission/index.js)
    const aggregationDone = new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(session as any).subscribe([
        {
          // @ts-expect-error dynamic import typing
          event: ZkVerifyEvents.NewAggregationReceipt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: async (eventData: any) => {
            try {
              const eventAggId = parseInt(eventData.data.aggregationId.replace(/,/g, ''))
              if (aggregationId !== eventAggId) return // not our proof

              const domainId = parseInt(eventData.data.domainId)

              // Get merkle path for on-chain verification
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const statementPath = await (session as any).getAggregateStatementPath(
                eventData.blockHash,
                domainId,
                eventAggId,
                statement
              )

              const aggregationJson = {
                ...statementPath,
                domainId,
                aggregationId: eventAggId,
              }

              fs.writeFileSync(aggregationOutputPath, JSON.stringify(aggregationJson, null, 2), 'utf8')

              sendEvent(res, {
                step: 'aggregated',
                aggregationId: eventAggId,
                domainId,
              })

              resolve()
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)))
            }
          },
          options: { domainId: 0 },
        },
      ])
    })

    // Submit proof
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { events, transactionResult } = await (session as any)
      .verify()
      // @ts-expect-error dynamic import typing
      .ultrahonk({ variant: UltrahonkVariant.Plain })
      .execute({
        proofData: {
          vk: vkHex,
          proof: proofHex,
          publicSignals: [],
        },
        domainId: 0,
      })

    // @ts-expect-error dynamic import typing
    events.on(ZkVerifyEvents.IncludedInBlock, (eventData: Record<string, unknown>) => {
      statement = eventData.statement
      aggregationId = eventData.aggregationId as number
      sendEvent(res, {
        step: 'included',
        txHash: eventData.txHash,
        aggregationId: eventData.aggregationId,
      })
    })

    // Wait for transaction to be finalised on ZKVerify
    await transactionResult

    // Wait for aggregation receipt (with 5-minute timeout)
    await Promise.race([
      aggregationDone,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Aggregation timeout after 5 minutes')), 300_000)
      ),
    ])

    sendEvent(res, { step: 'done' })
    await session.close()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    sendEvent(res, { step: 'error', message })
  }

  res.end()
}
