import React from 'react'

export type StepStatus = 'idle' | 'loading' | 'done' | 'error' | 'skipped'

export interface Step {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

interface StepTrackerProps {
  steps: Step[]
}

function StatusIcon({ status }: { status: StepStatus }) {
  const base = 'text-lg leading-none shrink-0 w-6 text-center'
  switch (status) {
    case 'idle':    return <span className={`${base} text-[#444]`}>⬜</span>
    case 'loading': return <span className={`${base} text-[#ffaa00] animate-pulse`}>⏳</span>
    case 'done':    return <span className={`${base} text-[#00ff88]`}>✅</span>
    case 'error':   return <span className={`${base} text-[#ff4444]`}>❌</span>
    case 'skipped': return <span className={`${base} text-[#555]`}>—</span>
  }
}

function labelColor(status: StepStatus): string {
  switch (status) {
    case 'loading': return 'text-white'
    case 'done':    return 'text-[#e0e0e0]'
    case 'error':   return 'text-[#ff4444]'
    default:        return 'text-[#666]'
  }
}

function connectorColor(status: StepStatus): string {
  switch (status) {
    case 'done':  return 'bg-[#00ff88]'
    case 'error': return 'bg-[#ff4444]'
    default:      return 'bg-[#333]'
  }
}

export default function StepTracker({ steps }: StepTrackerProps) {
  return (
    <div className="flex flex-col w-full p-6 bg-[#111] border border-[#222] rounded-xl">
      <p className="text-xs font-semibold text-[#666] uppercase tracking-widest mb-4">Progress</p>
      {steps.map((step, idx) => (
        <div key={step.id} className="relative py-2.5">
          {/* Connector line above (except first) */}
          {idx > 0 && (
            <div
              className={[
                'absolute left-[11px] -top-4 w-0.5 h-4 rounded-sm transition-colors duration-300',
                connectorColor(steps[idx - 1].status),
              ].join(' ')}
            />
          )}

          <div className="flex items-start gap-3">
            <StatusIcon status={step.status} />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className={`text-[15px] font-medium transition-colors duration-200 ${labelColor(step.status)}`}>
                {step.label}
              </span>
              {step.detail && (
                <span className="text-xs text-[#888] font-mono break-all leading-relaxed whitespace-pre-wrap">
                  {step.detail}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
