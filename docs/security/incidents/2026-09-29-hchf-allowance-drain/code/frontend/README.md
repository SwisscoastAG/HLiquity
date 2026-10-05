<!-- Reference artifact for the batch-transaction exit guide - companion artifact of the batch-transaction exit guide. -->
# HLiquity batch frontend — integration notes

Reference TypeScript modules for the existing blokk-studio/HLiquity dev-frontend. The batch
migration is a **wrapper change over the existing `ContractExecuteTransaction` builders, not a
stack change** (guide §6.1: the fork already uses `@hashgraph/hedera-wallet-connect ^1.4.2`
+ `@hashgraph/sdk 2.72.0`). See `package-notes.md` — add nothing; `hashconnect` is deprecated, do
not use it.

## Files

| File | Role |
|---|---|
| `config.ts` | Contract/token registry (guide §5), the three approval pairs (§5), gas table (§11), manual long-zero `evm()` helper. |
| `batchTxBuilder.ts` | No-operator batch assembly: per-inner `TransactionId.generate(user)` + `setBatchKey(userPublicKey)` + freeze via `transaction.freezeWithSigner(signer)` (dapp context has no client — `freezeWith(client)` is unavailable), then `addInnerTransaction` + freeze outer batch + base64 serialize for HIP-820. |
| `hliquityBatches.ts` | Typed builders for the 7 batched flows (§7): redeem, provideToSP, repayHCHF, closeTrove, adjustTrove, stake-HLQT, stake-LP — plus `associateTokens()` (native inner before the approve, §7) and `readRedemptionHints()` (ethers 5.7.2 `callStatic` via a JSON-RPC relay — read-only, no operator needed). |
| `useHederaBatch.ts` | React hook: state machine `idle → building → awaiting-signature → submitted → confirmed|failed`; PRIMARY path = community-validated per-transaction signing (`hedera_signTransaction` → wallet signs each inner + the outer, THREE prompts → `hedera_executeTransaction` relay), secondary single-prompt `hedera_signAndExecuteTransaction` kept but marked UNVALIDATED; exposes `signingInfo`/`statusMessage` (tells the UI to expect 3 prompts); runtime signature/body consistency guard (issue #694 class); polls the mirror node for the ATOMICBATCH parent + per-inner statuses. |
| `HashPackGate.tsx` | Version gate: HashPack ≥ 14.4.0 required for batch signing (§3); otherwise a warning panel with a non-atomic fallback behind an explicit risk warning. |

## Integration steps

1. **Copy the five modules** into the dev-frontend source tree (e.g. `src/hliquity-batch/`).
2. **Wire the wallet session into `UserBatchContext`**: `userAccountId` / `userPublicKey` /
   `signer` (the `DAppSigner` from the existing hedera-wallet-connect session) — the values the app
   already has when connected.
3. **Replace the 7 allowance-consuming call sites** with: builder from `hliquityBatches.ts` →
   `buildUserBatch(...)` from `batchTxBuilder.ts` → `useHederaBatch.executeBatch(...)`. Keep the
   existing single-tx path for all non-batched flows (§7).
4. **Wrap the flow root in `<HashPackGate wallet={...}>`**, feeding wallet name/version from the
   WalletConnect session metadata when available.
5. **Environment**: point `NETWORKS[...].jsonRpcRelay` at your preferred Hedera JSON-RPC relay for
   the hint reads. The mirror node is only polled for verification.
6. **UX requirements (guide §6.4)**: three-prompt explanation copy (validated signing
   shows one prompt per inner + one for the outer), exact-amount display for each approval inner,
   residue-allowance check + auto-zero after confirmation, HashPack version gate,
   graceful fallback = warn-and-proceed non-atomic only as an explicit user choice.

## Signing model — community-validated 3-prompt pattern (guide changelog C6)

Every inner carries the user's public key as its `batchKey`; the outer batch must be
signed by all distinct batchKey private keys plus the payer (guide §4). The
**community-validated** wallet flow is **per-transaction signing**: the dapp sends the
frozen outer batch via `hedera_signTransaction` and the wallet signs **each inner
transaction and then the outer separately** — a community contributor's mainnet
reproduction observed **THREE HashPack prompts** (one per inner + one for the outer, for
the standard 2-inner approve+call batch) with **hedera-wallet-connect 1.5.1 + HashPack
≥ 14.4.0** — after which the dapp relays the signed bytes with `hedera_executeTransaction`.
The UI must tell the user to expect 3 prompts (`statusMessage` in `useHederaBatch.ts`).

`hedera_signAndExecuteTransaction` (single prompt, wallet signs and submits) is kept as
an option (`signingPath: "single-prompt"`) but is a **separate, still-UNVALIDATED**
implementation — `signingInfo.communityValidated` is `false` for it.

Issue #694 (`DAppSigner.signTransaction` rebuilding the `ContractExecute` body on some
connector versions) is a **version-dependent caveat** for sign-then-relay flows: it does
**not** invalidate the validated 1.5.1 path. The hook keeps a runtime guard — signed
bytes must decode and carry the same transaction id that was sent — and maps a mismatch
to a `SIGNATURE_MISMATCH` error before anything is relayed.

## HashPack test plan (testnet — 6 scenarios, guide §40)

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | **Three-prompt UX (validated pattern)** | Building a 2-inner `redeem`/`provideToSP` batch and executing via the default `per-transaction` path shows THREE wallet prompts (one per inner + one for the outer batch) and the batch commits as ATOMICBATCH. This matches the community contributor's mainnet observation (hedera-wallet-connect 1.5.1 + HashPack ≥ 14.4.0). UI copy must set this expectation (`statusMessage`). |
| 2 | **Inner display (still UNVERIFIED)** | At each of the three prompts, capture whether HashPack renders the inner (associate/approve/call) with amounts and the exact-amount approval line. Feed result back into the UI copy. Whether inners are listed individually vs. a summary remains untested — no public screenshots. |
| 3 | **Failure rollback** | Force a failing inner (e.g. redeem more HCHF than balance): parent result `INNER_TRANSACTION_FAILED`, ALL inners rolled back, mirror shows no committed state change, residue allowance is 0. Verify the hook surfaces the user-facing message. Note: inners before the failure still pay fees (§1). |
| 4 | **Expired / BUSY** | Let the ~180 s valid duration lapse (or submit during congestion): pre-check `TRANSACTION_EXPIRED` / `BUSY`; UI must offer a clean rebuild-and-retry, not an error dump. |
| 5 | **Version gate** | Connect HashPack < 14.4.0 (or simulate undetectable version): gate shows the warning panel, batched flows are blocked, non-atomic fallback only behind the explicit risk warning. On ≥ 14.4.0: children render. |
| 6 | **Residue allowance check** | After each batched flow, query `GET /api/v1/accounts/{user}/allowances/tokens` and assert the flow's (token, spender) allowance is absent/0 (exact-amount approvals leave nothing for a sweeper). Surface a warning if residue > 0. |

The no-operator freeze + wallet signing combination is now COMMUNITY-VALIDATED on mainnet
(guide §3.3) for the per-transaction path. Remaining unknowns to validate on testnet:
how HashPack renders each inner at signing (scenario 2), and the single-prompt
`hedera_signAndExecuteTransaction` path (UNVALIDATED — exercise it explicitly with
`signingPath: "single-prompt"` before offering it to users). If `addInnerTransaction`
rejects unfrozen-looking inners, or HashPack rejects the outer batch bytes, stop and
report — do not route around it silently.
