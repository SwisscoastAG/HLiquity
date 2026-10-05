<!-- Reference artifact for the batch-transaction exit guide - companion artifact of the batch-transaction exit guide. -->
# Frontend dependency notes (blokk fork)

The existing blokk-studio/HLiquity dev-frontend already satisfies every requirement for
HIP-551 batch transactions. **Add nothing.**

| Dependency | Status | Note |
|---|---|---|
| `@hashgraph/hedera-wallet-connect` `1.5.1` | **PIN** | This exact resolved version produced the successful mainnet batch. Its `DAppSigner.signTransaction` returns a new signed transaction, which the reference code retains. Do not claim compatibility for `^1.4.2` or a one-prompt path without a separate test. |
| `@hashgraph/sdk` `2.72.0` | **KEEP** | `>=2.64.0` is required for `BatchTransaction` (guide §4); 2.72 already qualifies. Do not downgrade. |
| `hashconnect` | **DO NOT USE — DEPRECATED** | Final release 3.0.14 (2025-10-02), npm banner "shut down by 2026, upgrade to WalletConnect", GitHub repo is 404. HashPack 14.3.0 removed the legacy HashConnect v2 protocol. Any remaining hashconnect code must be removed, not wrapped. |
| `ethers` `5.7.2` | **KEEP** | Used in `hliquityBatches.ts` for read-only `callStatic` hint queries through a JSON-RPC relay. |
| HashPack browser extension | **>= 14.4.0 required** | 14.4.0 (2026-07-17) added batch-transaction support over WalletConnect ("bundle an associate + transfer in a single approval"); 14.4.1 added dapp auto-approval and removed the flaky WalletConnect auto-associate. Enforce with `HashPackGate.tsx`. |

Nothing new is needed. The batch migration is a wrapper change over the existing
`ContractExecuteTransaction` builders, not a stack change (guide §6.1).
