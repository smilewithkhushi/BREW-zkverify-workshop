# Magic Square ZK Circuit 

## What is a Magic Square?

A magic square is a 3x3 grid of numbers where:
- Every row adds up to the same number
- Every column adds up to the same number
- Both diagonals add up to the same number

Example (the classic Lo Shu square):
```
8  1  6   → sum = 15
3  5  7   → sum = 15
4  9  2   → sum = 15

↓  ↓  ↓
15 15 15

Diagonals: 8+5+2 = 15, 6+5+4 = 15
```

Rules for THIS circuit:
- Only single digits allowed (0 through 9)
- Numbers CAN repeat (unlike traditional magic squares)

---

## What Does the Circuit Actually Do?

This circuit is written in **Noir**, a language for writing ZK (zero-knowledge) proofs.

You feed it a 3x3 grid of numbers. The circuit checks if it's a valid magic square. That's it.

### Step-by-step:

1. **Check every number is a single digit** — all values must be less than 10
2. **Check rows** — add up each row, make sure they're all equal
3. **Check columns** — add up each column, make sure they're all equal
4. **Check diagonals** — add up both diagonals, make sure they're equal
5. **Final check** — the row sum, column sum, and diagonal sum must all match each other

If any of these checks fail, the proof fails. No passing with a broken square.

---

## Why ZK (Zero-Knowledge)?

The ZK part means: **you can prove you know a valid magic square without showing anyone what the numbers are.**

Think of it like saying "I know the secret password" without actually saying the password out loud. The verifier is convinced you know it, but learns nothing about it.

---

## Test Cases (from ARTIFACTS notes)

| Square | Valid? | Why |
|--------|--------|-----|
| `[[8,1,6],[3,5,7],[4,9,2]]` | Yes | All rows, cols, diags = 15 |
| `[[8,1,5],[2,5,7],[4,9,1]]` | No | Rows ok but columns don't match |
| `[[9,2,6],[3,5,8],[4,9,2]]` | No | Columns ok but rows don't match |

---

## Fun Context

Google published a paper where they used a ZK proof to prove knowledge of a quantum circuit — same idea, way more complex. This magic square circuit is the baby version of that concept.
