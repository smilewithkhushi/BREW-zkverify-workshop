import React from 'react'

interface MagicGridProps {
  values: number[][]
  onChange: (row: number, col: number, value: number) => void
  disabled?: boolean
}

export default function MagicGrid({ values, onChange, disabled = false }: MagicGridProps) {
  function handleChange(row: number, col: number, raw: string) {
    const parsed = parseInt(raw, 10)
    onChange(row, col, isNaN(parsed) ? 0 : parsed)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-3 gap-2 p-5 bg-[#111] border border-[#222] rounded-xl">
        {values.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              type="number"
              min={0}
              max={9}
              value={cell === 0 ? '' : cell}
              placeholder="0"
              disabled={disabled}
              onChange={(e) => handleChange(r, c, e.target.value)}
              className={[
                'w-[72px] h-[72px] bg-[#1a1a1a] border border-[#333] rounded-lg',
                'text-[#e0e0e0] text-3xl font-bold text-center outline-none',
                'transition-all duration-150',
                'focus:border-[#00ff88] focus:shadow-[0_0_0_2px_rgba(0,255,136,0.15)]',
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:border-[#444]',
              ].join(' ')}
            />
          ))
        )}
      </div>
      <p className="text-sm text-[#666] text-center">
        Enter digits 0–9. Rows, columns and diagonals must all sum to the same value.
      </p>
    </div>
  )
}
