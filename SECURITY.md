# Security Policy — HLiquity

HLiquity is a decentralized protocol: **no entity operates it**. This file is maintained by community
contributors. Nothing here is financial advice.

## Known issue: HTS allowance-sweep on the wrapper contracts (INC-2026-09-29)

The HLiquity token wrappers (`HCHFToken` 0.0.6070122, `HLQTToken` 0.0.6070127) expose an ungated,
inherited `transferFrom` helper (CWE-862). Any caller can instruct a wrapper to spend a user's token
allowance to an arbitrary recipient. A sweeper bot exploits the gap between a user's approval
transaction and the protocol operation that consumes it (7 s in the reference case). Contracts are
immutable; the mitigation is to **eliminate the gap**, not change the contracts.

**User guidance until the v2 contracts exist:**

- Do not submit HCHF/HLQT/LP token approvals as standalone transactions.
- Use atomic batch flows (HIP-551): approval + operation in one transaction. See
  [docs/security/incidents/2026-09-29-hchf-allowance-drain](./docs/security/incidents/2026-09-29-hchf-allowance-drain/README.md)
  — including the exact browser signing sequence validated by a 1 HCHF mainnet redemption,
  a source-reviewed but not yet live-tested CLI, and exact-amount rules (closeTrove reads and
  approves **current net debt only**; redemption is split into exact-or-revert chunks no larger
  than 1,780 HCHF), plus the note that percentage arguments are
  **8-decimal** (100% = 1e8).
- Hedera plans to remove smart-contract calls from atomic batches around **March 2027 (estimated)**.
  After that date: permissionless redemption via the community router track, Stability Pool exits /
  unstaking / claims work unchanged (no allowance involved), and trove operations for existing users
  require migrated (v2) contracts.
- Verify all addresses against
  [docs/security/incidents/2026-09-29-hchf-allowance-drain/verified-mainnet-addresses.json](./docs/security/incidents/2026-09-29-hchf-allowance-drain/verified-mainnet-addresses.json).
  The deployment configs under `packages/lib-ethers/deployments/` are stale.

## Reporting a vulnerability

- **Preferred:** GitHub private vulnerability reporting — open the repository's **Security** tab and
  click **"Report a vulnerability"** (enabled in this repository).
- Please **do not open a public issue** for an undisclosed vulnerability; give contributors time to
  document and validate a mitigation first.
- For on-chain incidents (ongoing drains, scam frontends, counterfeit tokens), open a public issue —
  speed matters and the data is public on the mirror node anyway.

## Disclosure history

| Date | ID | Summary |
|---|---|---|
| 2026-10-05 | INC-2026-09-29 | Wrapper allowance-sweep (CWE-862); batched-approval mitigation published; mainnet-validated by a community contributor |
| 2023-03-09 | (Hedera-wide) | HTS precompile delegatecall attack (~$600K) — Hedera post-mortem, fixed in services v0.34.5 |
