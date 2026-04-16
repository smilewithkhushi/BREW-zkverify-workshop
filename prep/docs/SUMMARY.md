# ZK Workshop — Complete Hands-On Guide

> This document covers every step from wallet setup to on-chain proof verification.
> Follow in order. Do not skip steps.

---

## What Are We Building?

We write a ZK circuit in Noir that proves knowledge of a valid **magic square** — without revealing the numbers. We then:
1. Compile and prove it locally
2. Submit the proof to **ZKVerify** (a blockchain that verifies ZK proofs)
3. Verify the aggregated proof on-chain via a **Solidity smart contract on Sepolia**

Reference: `prep/docs/1.ARTIFACTS.md`

---

## PHASE 1 — Setup

### Step 1: Wallet Setup (SubWallet)

**Install SubWallet:**
1. Go to [subwallet.app](https://subwallet.app) and install the browser extension
2. Create a new wallet
3. **Write down your seed phrase and store it safely** — you will need it later to submit proofs

---

**Enable ZKVerify Volta Testnet (for proof submission):**
1. Open SubWallet → go to **Manage Networks**
2. Search for **"Volta"** or **"ZKVerify"**
3. Enable it — this is the network where you submit ZK proofs

---

**Enable Ethereum Sepolia OR Horizen Testnet (for contract deployment):**

You need one of these for deploying the verifier contract. Pick the one you prefer:

| Option | Network Name | Chain ID | Purpose |
|--------|-------------|----------|---------|
| Ethereum Sepolia | Sepolia | `11155111` | Deploy + call `checkHash` |
| Horizen Testnet | Horizen EON Testnet | `1663` | Alternative EVM testnet |

In SubWallet → **Manage Networks** → search and enable your chosen network.

---

**Fund your wallet:**

| Token | Network | Used For | Faucet |
|-------|---------|---------|--------|
| `$tVFY` | Volta (ZKVerify) | Paying for proof submission transactions | ZKVerify Discord → `#faucet` channel |
| Sepolia ETH | Ethereum Sepolia | Deploying + calling the smart contract | [sepoliafaucet.com](https://sepoliafaucet.com) or [faucet.quicknode.com](https://faucet.quicknode.com/ethereum/sepolia) |
| Horizen Test ZEN | Horizen EON Testnet | Deploying + calling the smart contract (if using Horizen) | Horizen Discord faucet |

> You need **both** — `$tVFY` for ZKVerify AND ETH/ZEN for the EVM contract. Get both before starting.

> SubWallet supports both Substrate (ZKVerify/Volta) and EVM (Sepolia/Horizen) networks in one wallet.

---

### Step 2: Get Testnet Tokens

You need two types of tokens:

| Token | Network | Purpose | How to get |
|-------|---------|---------|------------|
| `$tVFY` | Volta (ZKVerify) | Pay for proof submission | ZKVerify Discord faucet |
| Sepolia ETH | Sepolia | Pay for contract deployment | Sepolia faucet (e.g. sepoliafaucet.com) |

> Get both before starting. You cannot proceed without them.

---

### Step 3: Install Tools

Run all commands in **native Terminal (macOS)** — not VS Code terminal.

**Install noirup + nargo:**
```
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.6
```

**Install bbup + bb:**
```
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
bbup
```

> Do NOT pass a version flag to `bbup` — it auto-detects the compatible version from nargo. Resolves to `bb v0.84.0`.

**Verify:**
```
nargo --version && bb --version
```

Expected:
- nargo: `1.0.0-beta.6`
- bb: `0.84.0`

Reference: `prep/docs/2.REQUIREMENTS.md`

---

## PHASE 2 — The Circuit

### Step 4: Understand the Circuit

The circuit (`prep/magic_square/src/main.nr`) takes a private 3x3 grid and checks:
1. All numbers are single digits (< 10)
2. All rows add up to the same sum
3. All columns add up to the same sum
4. Both diagonals add up to the same sum

The input is in `prep/magic_square/Prover.toml`:
```
square = [[8, 1, 6], [3, 5, 7], [4, 9, 2]]   → all sums = 15
```

Reference: `prep/docs/1.ARTIFACTS.md`, `prep/magic_square/src/main.nr`

---

### Step 5: Compile and Execute the Circuit

**Run all commands from inside `prep/magic_square/`**

**Compile:**
```
nargo compile
```
Generates `target/magic_square.json` (the circuit artifact)

**Execute:**
```
nargo execute
```
Runs the circuit with `Prover.toml` inputs and generates `target/magic_square.gz` (the witness)

Reference: `prep/docs/3.NOIR_COMMANDS.md`

---

### Step 6: Generate VK and Proof (with Keccak — required for ZKVerify)

> ZKVerify only accepts proofs using the **Keccak256** hash. Always use `--oracle_hash keccak`.

**Generate verification key:**
```
bb write_vk -b ./target/magic_square.json -o ./target/vk --oracle_hash keccak
```

**Generate proof:**
```
bb prove -b ./target/magic_square.json -w ./target/magic_square.gz -o ./target/proof --oracle_hash keccak
```

After this, `target/` will contain:
- `magic_square.json` — compiled circuit
- `magic_square.gz` — witness
- `vk` — verification key (binary)
- `proof` — proof (binary)

---

### Step 7: (Optional) Verify Proof Locally

```
bb verify -k ./target/vk -p ./target/proof
```

Reference: `prep/docs/3.NOIR_COMMANDS.md`

---

## PHASE 3 — Submit Proof to ZKVerify

### Step 8: Setup the Proof Submission Project

From `prep/proof-submission/`:

```
npm init -y && npm pkg set type=module
npm i zkverifyjs dotenv
```

**Create `.env.local`** and add your seed phrase:
```
SEED_PHRASE = "your twelve word seed phrase here"
```

> Never commit `.env.local` to GitHub. It is already in `.gitignore`.

Reference: `prep/docs/4.SETUP.md`, `prep/proof-submission/.gitignore`

---

### Step 9: Run the Proof Submission Script

The script (`prep/proof-submission/index.js`) does the following:
1. Reads binary `proof` and `vk` from `magic_square/target/`
2. Connects to ZKVerify's **Volta Testnet**
3. Submits the proof using `UltrahonkVariant.Plain`
4. Listens for `IncludedInBlock` and `NewAggregationReceipt` events
5. Saves `aggregation.json` once the proof is aggregated

```
node index.js
```

**Successful output looks like:**
```
Included in block {
  blockHash: '0x...',
  proofType: 'ultrahonk',
  domainId: 0,
  aggregationId: 269036,
  statement: '0x...',
  ...
}
```

Once `aggregation.json` is saved, you are done with ZKVerify submission.

Reference: `prep/proof-submission/index.js`

---

### What is `aggregation.json`?

This file contains a **merkle proof** that your proof was included in ZKVerify's aggregation. It looks like:

```json
{
  "root": "0x...",
  "proof": [],
  "numberOfLeaves": 1,
  "leafIndex": 0,
  "leaf": "0x...",
  "domainId": 0,
  "aggregationId": 269036
}
```

You will use these values to call the smart contract on Sepolia.

---

## PHASE 4 — On-Chain Verification (Sepolia)

### Step 10: Get Your `vkey` (bytes32)

Run this from inside `prep/proof-submission/`:

```
node --input-type=module << 'EOF'
import { readFileSync } from 'fs';
import { Web3 } from 'web3';
const web3 = new Web3();
const vk = readFileSync('../magic_square/target/vk');
console.log('vkey:', web3.utils.keccak256(vk));
EOF
```

Save this value — you need it as a constructor argument when deploying the contract.

---

### Step 11: Deploy the Smart Contract on Remix

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Create two files:
   - `IVerifyProofAggregation.sol` — interface (from `prep/contracts/`)
   - `MagicSquareVerifier.sol` — main verifier (from `prep/contracts/`)
3. Compile with Solidity `0.8.20`
4. In Deploy tab: select **Injected Provider** (SubWallet) and switch to **Sepolia**
5. Deploy `MagicSquareVerifier` with:
   - `_zkVerify`: `0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E`
   - `_vkey`: `<your bytes32 vkey from Step 10>`

> ZKVerify Sepolia Proxy: `0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E`
> Reference: `prep/proof-submission/contracts.md`

---

### Step 12: Call `checkHash` to Verify On-Chain

After deployment, call `checkHash` on Remix with values from `aggregation.json`:

| Parameter | Value |
|-----------|-------|
| `_hash` | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `_aggregationId` | `aggregationId` from aggregation.json |
| `_domainId` | `domainId` from aggregation.json (0) |
| `_merklePath` | `proof` array from aggregation.json |
| `_leafCount` | `numberOfLeaves` from aggregation.json |
| `_index` | `leafIndex` from aggregation.json |

If it returns `true` — **your ZK proof is verified on-chain on Sepolia.**

Reference: `prep/contracts/MagicSquareVerifier.sol`

---

## Full Flow Summary

```
Write Circuit (Noir)
       ↓
Compile + Execute (nargo)
       ↓
Generate VK + Proof with Keccak (bb)
       ↓
Submit to ZKVerify Volta Testnet (index.js)
       ↓
Receive aggregation.json
       ↓
Deploy MagicSquareVerifier on Sepolia (Remix)
       ↓
Call checkHash → returns true ✓
```

---

## Quick Reference

| Item | Value / Location |
|------|-----------------|
| Circuit | `prep/magic_square/src/main.nr` |
| Prover inputs | `prep/magic_square/Prover.toml` |
| Proof artifacts | `prep/magic_square/target/` |
| Submission script | `prep/proof-submission/index.js` |
| Aggregation output | `prep/proof-submission/aggregation.json` |
| Solidity contracts | `prep/contracts/` |
| ZKVerify Sepolia Proxy | `0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E` |
| nargo version | `1.0.0-beta.6` |
| bb version | `0.84.0` |
| Volta Testnet | ZKVerify's testnet for proof submission |
| Sepolia Chain ID | `11155111` |
