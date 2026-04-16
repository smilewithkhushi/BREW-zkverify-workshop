import type { NextPage } from 'next'
import Head from 'next/head'
import React, { useState, useCallback } from 'react'
import MagicGrid from '../components/MagicGrid'
import StepTracker, { Step, StepStatus } from '../components/StepTracker'

type AppState = 'IDLE' | 'PROVING' | 'SUBMITTING' | 'AGGREGATING' | 'VERIFYING' | 'DONE' | 'ERROR'

const DEFAULT_SQUARE: number[][] = [
  [8, 1, 6],
  [3, 5, 7],
  [4, 9, 2],
]

const INITIAL_STEPS: Step[] = [
  { id: 'validate',   label: 'Validating magic square',               status: 'idle' },
  { id: 'prove',      label: 'Generating ZK proof (nargo + bb)',       status: 'idle' },
  { id: 'connecting', label: 'Connecting to ZKVerify...',              status: 'idle' },
  { id: 'included',   label: 'Proof submitted — included in block',    status: 'idle' },
  { id: 'aggregating',label: 'Waiting for aggregation...',             status: 'idle' },
  { id: 'aggregated', label: 'Aggregated!',                            status: 'idle' },
  { id: 'verifying',  label: 'Waiting for Sepolia attestation...',      status: 'idle' },
  { id: 'verified',   label: 'Verified on-chain!',                     status: 'idle' },
]

function validateMagicSquareClient(square: number[][]): string | null {
  if (!Array.isArray(square) || square.length !== 3) return 'Square must be 3×3'
  for (const row of square) {
    if (!Array.isArray(row) || row.length !== 3) return 'Each row must have 3 values'
    for (const v of row) {
      if (!Number.isInteger(v) || v < 0 || v > 9) return 'Values must be digits 0–9'
    }
  }
  const target = square[0].reduce((a, b) => a + b, 0)
  for (let r = 0; r < 3; r++) {
    const sum = square[r].reduce((a, b) => a + b, 0)
    if (sum !== target) return `Row ${r + 1} sums to ${sum} (expected ${target})`
  }
  for (let c = 0; c < 3; c++) {
    const sum = square[0][c] + square[1][c] + square[2][c]
    if (sum !== target) return `Column ${c + 1} sums to ${sum} (expected ${target})`
  }
  const d1 = square[0][0] + square[1][1] + square[2][2]
  if (d1 !== target) return `Main diagonal sums to ${d1} (expected ${target})`
  const d2 = square[0][2] + square[1][1] + square[2][0]
  if (d2 !== target) return `Anti-diagonal sums to ${d2} (expected ${target})`
  if (new Set(square.flat()).size !== 9) return 'All 9 values must be unique'
  return null
}

function setStepStatus(steps: Step[], id: string, status: StepStatus, detail?: string): Step[] {
  return steps.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s))
}

const ZKVERIFY_EXPLORER  = 'https://zkverify-testnet.subscan.io'
const SEPOLIA_EXPLORER   = 'https://sepolia.etherscan.io'
const VERIFIER_CONTRACT  = '0x83AaEa8a0ace1c095F2cE28E862b78427e7efAca'
const ZKVERIFY_PROXY     = '0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E'

const Home: NextPage = () => {
  const [square, setSquare]           = useState<number[][]>(DEFAULT_SQUARE)
  const [appState, setAppState]       = useState<AppState>('IDLE')
  const [steps, setSteps]             = useState<Step[]>(INITIAL_STEPS)
  const [validationMsg, setValidationMsg] = useState<string | null>(null)
  const [isSquareValid, setIsSquareValid] = useState<boolean>(true)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [proofTxHash, setProofTxHash]                 = useState<string | null>(null)
  const [proofAggregationId, setProofAggregationId]   = useState<number | null>(null)
  const [attestationTxHash, setAttestationTxHash]     = useState<string | null>(null)

  const isRunning = appState !== 'IDLE' && appState !== 'DONE' && appState !== 'ERROR'
  const isDone    = appState === 'DONE'

  const handleCellChange = useCallback((row: number, col: number, value: number) => {
    setSquare((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = value
      return next
    })
    setValidationMsg(null)
  }, [])

  function handleValidate() {
    const err = validateMagicSquareClient(square)
    if (err) { setValidationMsg(err); setIsSquareValid(false) }
    else      { setValidationMsg('Valid magic square!'); setIsSquareValid(true) }
  }

  function updateStep(id: string, status: StepStatus, detail?: string) {
    setSteps((prev) => setStepStatus(prev, id, status, detail))
  }

  async function handleRun() {
    if (isRunning) return
    setSteps(INITIAL_STEPS)
    setErrorMsg(null)
    setProofTxHash(null)
    setProofAggregationId(null)
    setAttestationTxHash(null)
    setAppState('PROVING')

    // Step 1: Validate
    updateStep('validate', 'loading')
    const clientErr = validateMagicSquareClient(square)
    if (clientErr) {
      updateStep('validate', 'error', clientErr)
      setErrorMsg(clientErr); setAppState('ERROR'); return
    }
    updateStep('validate', 'done', 'All rows, columns, and diagonals sum correctly')

    // Step 2: Generate proof
    updateStep('prove', 'loading', 'Running nargo execute + bb prove...')
    let proveRes: Response
    try {
      proveRes = await fetch('/api/prove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ square }),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      updateStep('prove', 'error', msg); setErrorMsg(msg); setAppState('ERROR'); return
    }
    const proveData = await proveRes.json()
    if (!proveRes.ok || proveData.error) {
      const msg = proveData.error ?? 'Unknown error from /api/prove'
      updateStep('prove', 'error', msg); setErrorMsg(msg); setAppState('ERROR'); return
    }
    updateStep('prove', 'done', 'Proof generated successfully')

    // Steps 3–6: Submit via SSE
    setAppState('SUBMITTING')
    updateStep('connecting', 'loading')

    // Use a local flag instead of React state to detect SSE errors (avoids closure stale-state bug)
    let sseHadError = false

    await new Promise<void>((resolve) => {
      const evtSource = new EventSource('/api/submit')

      evtSource.onmessage = (event) => {
        let data: Record<string, unknown>
        try { data = JSON.parse(event.data) } catch { return }
        const step = data.step as string

        if (step === 'connecting') {
          updateStep('connecting', 'loading', 'Establishing ZKVerify session...')
        } else if (step === 'submitting') {
          updateStep('connecting', 'done', 'Session established')
          updateStep('included', 'loading', 'Submitting proof to ZKVerify...')
          setAppState('SUBMITTING')
        } else if (step === 'included') {
          setProofTxHash(data.txHash as string)
          setProofAggregationId(data.aggregationId as number)
          updateStep('included', 'done', `tx: ${data.txHash as string}`)
          updateStep('aggregating', 'loading', `Aggregation ID: ${data.aggregationId as string}`)
          setAppState('AGGREGATING')
        } else if (step === 'aggregated') {
          updateStep('aggregating', 'done')
          updateStep('aggregated', 'done', `aggregationId: ${data.aggregationId} | domainId: ${data.domainId}`)
        } else if (step === 'done') {
          evtSource.close(); resolve()
        } else if (step === 'error') {
          const msg = (data.message as string) ?? 'Unknown SSE error'
          setSteps((prev) => {
            const loading = prev.find((s) => s.status === 'loading')
            return loading ? setStepStatus(prev, loading.id, 'error', msg) : prev
          })
          sseHadError = true
          setErrorMsg(msg); setAppState('ERROR'); evtSource.close(); resolve()
        }
      }

      evtSource.onerror = () => {
        const msg = 'SSE connection error'
        setSteps((prev) => {
          const loading = prev.find((s) => s.status === 'loading')
          return loading ? setStepStatus(prev, loading.id, 'error', msg) : prev
        })
        sseHadError = true
        setErrorMsg(msg); setAppState('ERROR'); evtSource.close(); resolve()
      }
    })

    if (sseHadError) return

    // Step 7: Verify on Sepolia
    setAppState('VERIFYING')
    updateStep('verifying', 'loading', 'Polling checkHash on Sepolia (may take ~2–5 min for bridge)...')
    let verifyRes: Response
    try {
      verifyRes = await fetch('/api/verify', { method: 'POST' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      updateStep('verifying', 'error', msg); setErrorMsg(msg); setAppState('ERROR'); return
    }
    const verifyData = await verifyRes.json()
    if (!verifyRes.ok || verifyData.error) {
      const msg = verifyData.error ?? 'Unknown error from /api/verify'
      updateStep('verifying', 'error', msg); setErrorMsg(msg); setAppState('ERROR'); return
    }
    if (verifyData.verified) {
      const attTx = verifyData.attestationTxHash ?? null
      setAttestationTxHash(attTx)
      updateStep('verifying', 'done', attTx ? `tx: ${attTx}` : 'checkHash returned true')
      updateStep('verified', 'done', 'Proof verified on Ethereum Sepolia!')
      setAppState('DONE')
    } else {
      updateStep('verifying', 'error', 'checkHash returned false')
      setErrorMsg('On-chain verification returned false'); setAppState('ERROR')
    }
  }

  return (
    <>
      <Head>
        <title>Magic Square ZK Proof</title>
        <meta name="description" content="ZK workshop demo — prove a magic square on ZKVerify" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-[#0a0a0a] flex justify-center px-4 py-10 pb-20">
        <div className="w-full max-w-5xl flex flex-col gap-8">

          {/* Header */}
          <header className="flex flex-col gap-3">
            <span className="self-start bg-[rgba(0,255,136,0.1)] text-[#00ff88] border border-[rgba(0,255,136,0.3)] rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              zkVerify Workshop
            </span>
            <h1 className="text-4xl font-extrabold text-white tracking-tight leading-tight">
              Magic Square ZK Proof
            </h1>
            <p className="text-[15px] text-[#888] leading-relaxed max-w-2xl">
              Prove knowledge of a valid 3×3 magic square using Noir + Barretenberg,
              submit the proof to{' '}
              <a href="https://zkverify.io" target="_blank" rel="noreferrer" className="text-[#aaa] hover:text-white underline underline-offset-2">ZKVerify</a>
              , and verify it on Ethereum Sepolia network without ever revealing the magic square information.
            </p>
          </header>

          {/* Two-column layout: grid card left, progress right */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* Left: Grid card */}
            <section className="bg-[#111] border border-[#222] rounded-2xl p-7 flex flex-col gap-5 items-center w-full lg:w-auto lg:shrink-0">
              <h2 className="self-start text-xs font-semibold text-[#666] uppercase tracking-widest">
                Enter your magic square
              </h2>

              <MagicGrid values={square} onChange={handleCellChange} disabled={isRunning} />

              {/* Validate row */}
              <div className="flex items-center gap-4 flex-wrap justify-center">
                <button
                  onClick={handleValidate}
                  disabled={isRunning}
                  className="bg-transparent border border-[#333] text-[#ccc] rounded-lg px-5 py-2.5 text-sm font-medium transition-colors hover:border-[#555] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Validate square
                </button>
                {validationMsg && (
                  <span className={`text-sm font-medium ${isSquareValid ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                    {isSquareValid ? '✓ ' : '✗ '}{validationMsg}
                  </span>
                )}
              </div>

              {/* Main CTA */}
              <button
                onClick={handleRun}
                disabled={!isSquareValid || isRunning}
                className="w-full bg-[#00ff88] text-black font-bold text-base rounded-xl py-3.5 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRunning ? 'Running...' : isDone ? 'Run again' : 'Generate & Verify'}
              </button>

              {/* Error */}
              {errorMsg && (
                <div className="w-full bg-[rgba(255,68,68,0.08)] border border-[rgba(255,68,68,0.3)] rounded-lg px-4 py-3 text-sm text-[#ff7777] break-words leading-relaxed">
                  <strong>Error:</strong> {errorMsg}
                </div>
              )}
            </section>

            {/* Right: Step tracker */}
            <section className="flex flex-col w-full lg:flex-1">
              <StepTracker steps={steps} />
            </section>

          </div>

          {/* Done banner */}
          {isDone && (
            <div className="flex items-center gap-5 bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.25)] rounded-2xl px-7 py-6">
              <span className="text-4xl">🎉</span>
              <div>
                <p className="text-[#00ff88] font-bold text-lg">Proof verified on-chain!</p>
                <p className="text-[#aaa] text-sm mt-1">
                  Your magic square knowledge was proven with ZK and verified on Ethereum Sepolia.
                </p>
              </div>
            </div>
          )}

          {/* On-chain explorer links */}
          {isDone && (
            <section className="bg-[#111] border border-[#222] rounded-2xl p-6 flex flex-col gap-5">
              <h2 className="text-xs font-semibold text-[#666] uppercase tracking-widest">
                Explore on-chain
              </h2>

              {/* ZKVerify Volta */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-[#555] uppercase tracking-widest">
                  ZKVerify — Volta Testnet
                </p>
                {proofTxHash && (
                  <a
                    href={`${ZKVERIFY_EXPLORER}/extrinsic/${proofTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 bg-[#161616] border border-[#2a2a2a] rounded-lg px-4 py-3 hover:border-[#444] transition-colors group"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs text-[#888]">Proof submission tx</span>
                      <span className="text-sm text-[#ccc] font-mono truncate group-hover:text-white">
                        {proofTxHash}
                      </span>
                    </div>
                    <span className="text-[#555] group-hover:text-[#00ff88] shrink-0 text-lg">↗</span>
                  </a>
                )}
                {proofAggregationId !== null && (
                  <a
                    href={`${ZKVERIFY_EXPLORER}/extrinsic/${proofTxHash ?? ''}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 bg-[#161616] border border-[#2a2a2a] rounded-lg px-4 py-3 hover:border-[#444] transition-colors group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-[#888]">Aggregation ID</span>
                      <span className="text-sm text-[#ccc] font-mono group-hover:text-white">
                        {proofAggregationId}
                      </span>
                    </div>
                    <span className="text-[#555] group-hover:text-[#00ff88] shrink-0 text-lg">↗</span>
                  </a>
                )}
              </div>

              {/* Ethereum Sepolia */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-[#555] uppercase tracking-widest">
                  Ethereum — Sepolia Testnet
                </p>
                {attestationTxHash && (
                  <a
                    href={`${SEPOLIA_EXPLORER}/tx/${attestationTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 bg-[#161616] border border-[rgba(0,255,136,0.2)] rounded-lg px-4 py-3 hover:border-[rgba(0,255,136,0.4)] transition-colors group"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs text-[#00cc66]">ZKVerify attestation posted on Sepolia</span>
                      <span className="text-sm text-[#ccc] font-mono truncate group-hover:text-white">
                        {attestationTxHash}
                      </span>
                    </div>
                    <span className="text-[#00cc66] group-hover:text-[#00ff88] shrink-0 text-lg">↗</span>
                  </a>
                )}
                <a
                  href={`${SEPOLIA_EXPLORER}/address/${VERIFIER_CONTRACT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 bg-[#161616] border border-[#2a2a2a] rounded-lg px-4 py-3 hover:border-[#444] transition-colors group"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-[#888]">MagicSquareVerifier contract</span>
                    <span className="text-sm text-[#ccc] font-mono truncate group-hover:text-white">
                      {VERIFIER_CONTRACT}
                    </span>
                  </div>
                  <span className="text-[#555] group-hover:text-[#00ff88] shrink-0 text-lg">↗</span>
                </a>
                <a
                  href={`${SEPOLIA_EXPLORER}/address/${ZKVERIFY_PROXY}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 bg-[#161616] border border-[#2a2a2a] rounded-lg px-4 py-3 hover:border-[#444] transition-colors group"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-[#888]">ZKVerify attestation proxy</span>
                    <span className="text-sm text-[#ccc] font-mono truncate group-hover:text-white">
                      {ZKVERIFY_PROXY}
                    </span>
                  </div>
                  <span className="text-[#555] group-hover:text-[#00ff88] shrink-0 text-lg">↗</span>
                </a>
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="text-center text-xs text-[#444] pt-2">
            <span>
              Built with ♥ by{' '}
              <a href="https://twitter.com/smilewithkhushi" target="_blank" rel="noreferrer" className="text-[#666] hover:text-[#aaa] transition-colors">
                @smilewithkhushi
              </a>
              , DevRel{' '}
              <a href="https://zkverify.io" target="_blank" rel="noreferrer" className="text-[#666] hover:text-[#aaa] transition-colors">
                @zkVerify
              </a>
            </span>
          </footer>


        </div>
      </main>
    </>
  )
}

export default Home
