# INC-2026-09-29: HCHF/HLQT/LP allowance-sweep drain

Community security documentation. **No entity operates the HLiquity protocol** — this analysis was
produced by community contributors from public Hedera mainnet data. Not financial advice.
Corrections via GitHub issues only.

## What happened

A sweeper bot monitors the Hedera network for token **allowances granted to the HLiquity wrapper
contracts** and spends them within seconds (7 s in the reference case). The bot does not exploit the
protocol's business logic — the TroveManager behaved correctly and reverted the victim's redemption
atomically. The loss happens in the gap between two user transactions: the approval and the operation
that consumes it.

- **Root cause:** CWE-862 (missing authorization). The token wrappers (`HCHFToken` 0.0.6070122,
  `HLQTToken` 0.0.6070127) inherit hashgraph's legacy `HederaTokenService.sol`, whose external
  `transferFrom` (selector `0x15dacbea`) is ungated — any caller can instruct the wrapper to spend a
  user's allowance to an arbitrary recipient. Contracts are immutable and ownership-renounced; there is
  no admin fix.
- **Reference transaction:** [0.0.995584-1790680920-326001014](https://hashscan.io/mainnet/transaction/0.0.995584-1790680920-326001014)
  (2026-09-29, 1,800 HCHF drained from 0.0.846778 seven seconds after its approval).
- **Suspected infrastructure (on-chain behavior, neutral labels):** receiver 0.0.10393273, relayer
  0.0.995584. The same crew swept BankSocial allowances (BSL/sBSL) in July 2026 via deleted contract
  0.0.7444023, and operates the known WHBAR `withdraw(src,dst,wad)` sweep (see the SaucerSwap advisory).
- **Scale:** 10 HCHF victims / 5,907.60 HCHF across four waves (2026-07-08 → 2026-10-03); ≈ US$7.5K
  observed HLiquity damage, ≈ US$611K–636K same-class losses across Hedera since 2023 (dominated by the
  2023-03 precompile attack, ~US$600K). The live vulnerable WHBAR wrapper still holds ≈ US$20.4M of
  supply exposure. Full ledger: the guide below, section 2.

## What users should do

1. **Do not make fresh HCHF/HLQT/LP token approvals** through any frontend that submits the approval
   as its own transaction.
2. **Need to exit now (redeem, close trove, repay, stake)?** Use an **atomic batch** — the approval and
   the operation in ONE HIP-551 batch transaction — so no window exists:
   - Ready-to-run CLI (no frontend needed): [`code/cli`](./code/cli) — see
     [`code/README.md`](./code/README.md).
   - Mainnet-validated by a community contributor (guide §3.3): 1 HCHF redeem batch succeeded,
     consumed/burned exactly 100,000,000 units, zero allowance left. The `closeTrove` batch flow
     (net-debt approval) is implemented and verified against the contract source but **not yet
     live-tested** — first live run should use a small trove (see the PR discussion).
3. **Safety-critical amount rules** (wrong amounts leave stealable residue):
   - `closeTrove`: approve exactly **net debt = debt − 20 HCHF** (the GasPool provides the 20).
     Approving full debt leaves a 20 HCHF allowance.
   - `redeemCollateral`: approve and call with the **truncated amount** from
     `HintHelpers.getRedemptionHints`, or abort if truncated — never approve more than the call consumes.
   - Percentages are **8-decimal** on this deployment: 100% = `1e8`, 0.5% floor = `500000`.
4. **Revoke unused allowances** on HashScan
   (`https://hashscan.io/mainnet/accounts/<your-account>/allowances`).
5. **Verify every address** against [`verified-mainnet-addresses.json`](./verified-mainnet-addresses.json)
   — counterfeit HLQT tokens exist. The repo-committed deployment configs in
   `packages/lib-ethers/deployments/` are **stale**; do not use them.
6. **Nobody will ever DM you about refunds.** That is always a scam.

## Deadlines

- Hedera deprecated smart-contract calls inside atomic batches on 2026-09-22; removal is planned for
  **March 2027 (estimated)**. The batched-approval path is a bridge, not the endgame: durable fix =
  a permissionless **redemption router** (in-EVM composition), then a **v2** with fixed contracts.
  Stability Pool exits, unstaking, claims and `claimCollateral` need no batching and keep working
  unchanged after March 2027.

## Contents of this folder

| File | Purpose |
|---|---|
| [`hliquity-batch-exit-guide.html`](./hliquity-batch-exit-guide.html) / [`.pdf`](./hliquity-batch-exit-guide.pdf) | Full community guide (community-2.0): incident forensics, batch mechanics, CLI tutorial, frontend build spec, timeline, evidence appendix |
| [`code/`](./code) | Runnable reference implementation: Node.js CLI + TypeScript frontend modules (React / hedera-wallet-connect) |
| [`verified-mainnet-addresses.json`](./verified-mainnet-addresses.json) | On-chain-fingerprinted mainnet contract/token manifest (supersedes stale repo configs) |

## Related

- Repository [`SECURITY.md`](../../../../SECURITY.md)
- Same-class vulnerability, largest surface: SaucerSwap WHBAR advisory
  (<https://www.saucerswap.finance/blog/whbar-contract-securityadvisory>)
- Hedera batch-transaction deprecation (2026-09-22):
  <https://hedera.com/blog/atomic-batch-transactions-no-longer-support-smart-contract-calls/>
- Hedera 2023 post-mortem: <https://hedera.com/blog/analysis-remediation-of-the-precompile-attack-on-the-hedera-network/>
