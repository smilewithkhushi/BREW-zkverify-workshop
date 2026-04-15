# Requirements

---

## Tool Versions (ZKVerify Compatible)

| Tool | Version |
|------|---------|
| nargo | `1.0.0-beta.6` |
| bb | `0.84.0` |

---

## Installation

### 1. Install noirup + nargo
```
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
```
```
noirup -v 1.0.0-beta.6
```

### 2. Install bbup + bb
```
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
```
```
bbup
```
> Do NOT pass a version flag — `bbup` auto-detects the compatible `bb` version from your nargo install. Resolves to `v0.84.0` for nargo `1.0.0-beta.6`.

---

## Verify
```
nargo --version && bb --version
```

> Tested on **macOS** — run all install commands in native Terminal, not VS Code terminal.