# ZK Workshop — Magic Square

A zero-knowledge proof workshop that proves knowledge of a valid **magic square** without revealing the numbers, using Noir + ZKVerify + Solidity on Sepolia.

---

## Folder Structure

```
prep/
├── magic_square/        # Noir circuit
│   ├── src/main.nr      # Circuit logic
│   ├── Prover.toml      # Private inputs
│   └── target/          # Compiled artifacts (gitignored except magic_square.json)
├── proof-submission/    # Node.js script to submit proof to ZKVerify
│   ├── index.js         # Main submission script
│   └── .env.local       # Seed phrase (gitignored)
├── contracts/           # Solidity contracts for on-chain verification
│   ├── IVerifyProofAggregation.sol
│   └── MagicSquareVerifier.sol
└── docs/                # Step-by-step documentation
    ├── 1.ARTIFACTS.md       # What the circuit does
    ├── 2.REQUIREMENTS.md    # Tool versions, install commands, wallet setup
    ├── 3.NOIR_COMMANDS.md   # nargo + bb commands
    └── 4.ZKVERIFY_AND_CONTRACT.md  # ZKVerify submission + Sepolia contract
```

---

## What It Does

1. **Circuit** — a 3x3 magic square verifier written in Noir (UltraHonk)
2. **Prove** — compile + execute with `nargo`, generate proof with `bb`
3. **Submit** — send proof to ZKVerify Volta Testnet via `zkverifyjs`
4. **Verify** — call `MagicSquareVerifier.checkHash()` on Sepolia — returns `true`

---

## Quick Start

### Requirements
- nargo `1.0.0-beta.6` and bb `0.84.0` — see `docs/2.REQUIREMENTS.md`
- SubWallet with Volta Testnet + Sepolia enabled
- `$tVFY` tokens (ZKVerify Discord faucet) + Sepolia ETH

### 1. Compile + Prove
```bash
cd magic_square
nargo compile
nargo execute
bb write_vk -b ./target/magic_square.json -o ./target/vk --oracle_hash keccak
bb prove -b ./target/magic_square.json -w ./target/magic_square.gz -o ./target/proof --oracle_hash keccak
```

### 2. Submit to ZKVerify
```bash
cd ../proof-submission
npm i
node index.js
```

### 3. Verify on Sepolia
Deploy `MagicSquareVerifier.sol` on Remix → call `checkHash` with values from `aggregation.json`

---

## Deployed Contract

| Network | Address |
|---------|---------|
| Sepolia | [`0x83AaEa8a0ace1c095F2cE28E862b78427e7efAca`](https://sepolia.etherscan.io/address/0x83AaEa8a0ace1c095F2cE28E862b78427e7efAca) |

ZKVerify Proxy on Sepolia: `0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E`

---

## Docs

For the full step-by-step guide including wallet setup, see `docs/SUMMARY.md`.
