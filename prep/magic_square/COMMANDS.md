# Noir Circuit Commands

**Run all commands from inside the `magic_square` directory.**

---

## 1. Compile the circuit
Converts your Noir code into an artifact (ACIR bytecode) that can be used for proving.
```
nargo compile
```

---

## 2. Execute the circuit
Runs the circuit with the inputs from `Prover.toml` and generates the witness.
```
nargo execute
```
---

## 3. Generate the verification key
Creates a verification key from the compiled circuit — needed to verify proofs.
```
bb write_vk -b ./target/magic_square.json -o ./target
```
---

## 4. Generate a proof
Takes the compiled circuit + witness and produces a ZK proof.
```
bb prove -b ./target/magic_square.json -w ./target/magic_square.gz -o ./target
```



---

## 5. Verify the proof
Checks that the proof is valid against the verification key.
```
bb verify -k ./target/vk -p ./target/proof
```

---

## 6. Run tests (if any test functions exist in the circuit)
```
nargo test
```

---

## 7. Check for errors without compiling
Lints and type-checks the circuit code.
```
nargo check
```
