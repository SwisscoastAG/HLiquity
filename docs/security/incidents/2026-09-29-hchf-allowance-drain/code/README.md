<!-- Reference artifact for the batch-transaction exit guide - companion artifact of the batch-transaction exit guide. -->
# HLiquity batch emergency-exit — reference code

Runnable reference artifacts for **the guide** of the HLiquity incident-response guide
(*Batch-Transaction Emergency Exit & Frontend Implementation Guide*, 2026-10-05). The single
source of truth for every API, address and rule used here is `../hliquity-batch-exit-guide.html` — read it first.

## What each artifact is for

| Path | Purpose |
|---|---|
| `cli/` | **No-frontend emergency path.** Node.js 18+ CLI (`hliquity-batch`) that builds, signs, executes and verifies HIP-551 atomic batches for the 7 allowance-consuming HLiquity flows, so users can exit without touching the vulnerable approve→wait→operate sequence. Mirrors the CLI tutorial section of the guide. |
| `cli/config.js` | Mainnet-only contract/token IDs (guide §5), the three critical approval pairs, gas table, and long-zero EVM helper. |
| `cli/flows.js` | One async builder per flow (§7): batched flows return `[exact approval FIRST, contract call LAST]` (HIP-551 one-contract-op-last rule, §1); non-batched flows return a single `ContractExecuteTransaction`. `redeemCollateral` mirrors the established frontend&rsquo;s JSON-RPC `eth_call` preflight: simulated `PriceFeed.fetchPrice`, `HintHelpers.getRedemptionHints`, `getApproxHint`, then `SortedTroves.findInsertPosition`. SDK `ContractCallQuery` is intentionally not used for `fetchPrice` because Hedera rejects its possible state modification. |
| `cli/hliquity-batch.js` | CLI entry: 16 subcommands, mirror-node allowance-residue verification after execution, clean exit codes, no color deps. |
| `frontend/` | **Wallet path for the blokk fork.** TypeScript reference modules wrapping the existing `ContractExecuteTransaction` builders into batches signed via `@hashgraph/hedera-wallet-connect` (HIP-820) using the community-validated per-transaction pattern (each inner + the outer signed separately — three HashPack prompts — then relayed with `hedera_executeTransaction`; hedera-wallet-connect 1.5.1 + HashPack ≥ 14.4.0). |

Both folders encode the same incident rule: **the approval inner transaction carries an EXACT
amount and lands FIRST; the contract call lands LAST** — closing the 7-second allowance-sweep
window, since the approval can never exist on-chain without the operation that consumes it
(atomic commit/rollback, guide §4). Exact-amount semantics per guide changelog:
**closeTrove reads and approves CURRENT NET DEBT = getEntireDebtAndColl(user) − 20 HCHF**
(typed/displayed debt is not trusted),
**maxFeePercentage is 8-decimal** (100% = 1e8, 0.5% floor = 500000 — C3), and **redemption
redeems in one-iteration, non-truncated chunks no larger than 1,780 HCHF** (C4).

## Security notes

- **Never hardcode keys.** The CLI reads `OPERATOR_ID` / `OPERATOR_KEY_DER` from `.env` only
  (copy `.env.example`); private keys are never logged.
- **Mainnet registry only.** This reference intentionally has no testnet mode because the bundled
  addresses are mainnet addresses. Start with the smallest practical mainnet amount.
- **Deprecation deadline.** Contract calls inside atomic batches are deprecated and scheduled for
  removal ~March 2027 (guide §3.1). This batch path is a stop-gap bridge; the durable fix is the
  redemption/operation router and/or v2 contracts. Do not plan anything that depends on
  contract-call inners past Feb 2027.
- **Residue check.** Every batched run ends with a mirror-node check that the flow's allowance is
  back to zero — any residue is exactly what the sweeper bots drain.
- **Community validation (guide changelog).** The per-transaction signing flow (each inner +
  the outer signed separately, three HashPack prompts, then `hedera_executeTransaction` relay)
  was reproduced on mainnet by a community contributor with hedera-wallet-connect 1.5.1 +
  HashPack ≥ 14.4.0. The implementation uses a fresh ephemeral batch key and preserves every
  transaction returned by `DAppSigner.signTransaction`. The untested single-prompt path was
  removed rather than exposed as an option.

## How the CLI and frontend relate to the guide

the guide teaches the same mitigation twice: §5 (tutorial) walks an operator through this CLI;
§6 recommends the frontend architecture the `frontend/` modules implement. The two artifacts share
one design (guide §6.3 flow→batch map, §1 assembly rules) but deliberately duplicate the small
`evm()` helper and config constants instead of importing across folders, so each artifact stays
self-contained and copy-pasteable into its target environment.

## Quick start (CLI)

```bash
cd cli
npm install
cp .env.example .env   # fill in OPERATOR_ID / OPERATOR_KEY_DER; mainnet only
node hliquity-batch.js --help
node hliquity-batch.js redeem --amount 1500 --associate
```
