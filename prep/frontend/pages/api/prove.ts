import type { NextApiRequest, NextApiResponse } from 'next'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

type ProveRequest = {
  square: number[][]
}

type ProveResponse =
  | { success: true }
  | { error: string }

function validateMagicSquare(square: number[][]): string | null {
  // Must be 3x3
  if (!Array.isArray(square) || square.length !== 3) {
    return 'Square must be 3x3'
  }
  for (const row of square) {
    if (!Array.isArray(row) || row.length !== 3) {
      return 'Each row must have exactly 3 values'
    }
  }

  // All values must be single digits 0–9
  for (const row of square) {
    for (const v of row) {
      if (!Number.isInteger(v) || v < 0 || v > 9) {
        return 'All values must be digits 0–9'
      }
    }
  }

  // Compute target sum from first row
  const flat = square.flat()
  const target = square[0].reduce((a, b) => a + b, 0)

  // Check all rows
  for (let r = 0; r < 3; r++) {
    const sum = square[r].reduce((a, b) => a + b, 0)
    if (sum !== target) {
      return `Row ${r + 1} sums to ${sum}, expected ${target}`
    }
  }

  // Check all columns
  for (let c = 0; c < 3; c++) {
    const sum = square[0][c] + square[1][c] + square[2][c]
    if (sum !== target) {
      return `Column ${c + 1} sums to ${sum}, expected ${target}`
    }
  }

  // Check main diagonal (top-left to bottom-right)
  const diag1 = square[0][0] + square[1][1] + square[2][2]
  if (diag1 !== target) {
    return `Main diagonal sums to ${diag1}, expected ${target}`
  }

  // Check anti-diagonal (top-right to bottom-left)
  const diag2 = square[0][2] + square[1][1] + square[2][0]
  if (diag2 !== target) {
    return `Anti-diagonal sums to ${diag2}, expected ${target}`
  }

  // All values must be unique (classic magic square uses 1–9 each exactly once)
  const sorted = [...flat].sort((a, b) => a - b)
  const unique = new Set(flat)
  if (unique.size !== 9) {
    return 'All 9 values must be unique'
  }

  return null // valid
}

function writeProverToml(square: number[][], tomlPath: string) {
  const rows = square.map((row) => `[${row.join(', ')}]`).join(',\n    ')
  const content = `square = [\n    ${rows}\n]\n`
  fs.writeFileSync(tomlPath, content, 'utf8')
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProveResponse>
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { square } = req.body as ProveRequest

  if (!square) {
    res.status(400).json({ error: 'Missing square in request body' })
    return
  }

  // Validate
  const validationError = validateMagicSquare(square)
  if (validationError) {
    res.status(400).json({ error: `Invalid magic square: ${validationError}` })
    return
  }

  // Paths
  const circuitDir = path.resolve(process.cwd(), '..', 'magic_square')
  const proverTomlPath = path.join(circuitDir, 'Prover.toml')
  const proofOutputPath = path.join(circuitDir, 'target', 'proof')

  // If target/proof exists as a directory (from a previous manual run), remove it
  // so bb can write it as a file
  try {
    if (fs.existsSync(proofOutputPath) && fs.statSync(proofOutputPath).isDirectory()) {
      fs.rmSync(proofOutputPath, { recursive: true })
    }
  } catch {
    // ignore cleanup errors
  }

  try {
    // Write Prover.toml
    writeProverToml(square, proverTomlPath)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: `Failed to write Prover.toml: ${message}` })
    return
  }

  try {
    // Step 1: nargo execute
    execSync('nargo execute', {
      cwd: circuitDir,
      stdio: 'pipe',
      timeout: 120_000,
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? (err as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ||
          err.message
        : String(err)
    res.status(500).json({ error: `nargo execute failed: ${message}` })
    return
  }

  try {
    // Step 2: bb prove
    execSync(
      'bb prove -b ./target/magic_square.json -w ./target/magic_square.gz -o ./target --oracle_hash keccak',
      {
        cwd: circuitDir,
        stdio: 'pipe',
        timeout: 300_000,
      }
    )
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? (err as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ||
          err.message
        : String(err)
    res.status(500).json({ error: `bb prove failed: ${message}` })
    return
  }

  try {
    // Step 3: bb write_vk — generates the verification key needed for ZKVerify submission
    execSync(
      'bb write_vk -b ./target/magic_square.json -o ./target --oracle_hash keccak',
      {
        cwd: circuitDir,
        stdio: 'pipe',
        timeout: 120_000,
      }
    )
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? (err as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ||
          err.message
        : String(err)
    res.status(500).json({ error: `bb write_vk failed: ${message}` })
    return
  }

  res.status(200).json({ success: true })
}
