# HLiquity batch frontend - mainnet-tested integration notes

These TypeScript reference modules reproduce the browser signing sequence that
successfully redeemed exactly 1 HCHF on mainnet in parent transaction
`0.0.4093645@1791199479.519938818`.

The evidence is intentionally narrow:

- validated: native exact HCHF approval first, one `redeemCollateral` call last,
  three HashPack prompts, connector 1.5.1, HashPack >=14.4.0, exact 1 HCHF debit,
  HBAR returned, zero allowance after confirmation;
- not validated by that transaction: close-trove, repay, Stability Pool deposit,
  HLQT/LP stake, other wallets, or a one-prompt sign-and-execute path.

## Required signing sequence

`buildUserBatch()` performs the load-bearing sequence:

1. Generate one ephemeral ED25519 batch key in browser memory.
2. For each inner, set that public batch key and an explicit payer transaction
   ID, then call plain `freeze()` so the SDK installs synthetic node `0.0.0`.
3. Call `DAppSigner.signTransaction(inner)` for each inner and retain the
   transaction object returned by the signer.
4. Assemble those returned signed inners and freeze the outer batch with the
   signer.
5. Call `DAppSigner.signTransaction(outer)`, retain the returned outer, and
   sign it locally with the ephemeral batch key.
6. Relay those already signed bytes unchanged with
   `hedera_executeTransaction`.

A standard two-inner batch produces three HashPack prompts: approval inner,
contract-call inner, outer batch. The ephemeral private key cannot authorize the
user account or either inner; it only proves batch membership.

Do not:

- use the wallet account public key as `batchKey`;
- call `freezeWithSigner()` on an inner;
- ignore the transaction returned by `signer.signTransaction()`;
- call connector `signTransaction` once on a serialized outer and assume it
  signs the inners;
- offer a non-atomic approval fallback.

## Flow safety rules

- Preflight rejects any existing allowance for the exact token/spender pair.
- Approval amounts use `Long.fromString(...)`, matching the SDK 2.72.0 type
  contract and the mainnet test.
- Redemption uses the existing frontend's populated redemption transaction,
  exactly one iteration, no truncation, and a chunk no larger than
  `MIN_NET_DEBT = 1,780 HCHF`. This makes a successful call consume the exact
  approved amount; otherwise the call reverts and the batch rolls back. Split
  larger exits into repeated batches.
- Close-trove reads `getEntireDebtAndColl(user)` immediately before building
  and approves `entireDebt - 20 HCHF`. Never accept a typed/displayed debt
  amount as authority.
- After consensus, `useHederaBatch` polls until both the allowance is zero and
  the token debit equals the approval. A mismatch is a critical incident, not a
  normal success state.

## Integration

1. Pin `@hashgraph/hedera-wallet-connect` to the tested `1.5.1` and keep
   `@hashgraph/sdk` at `2.72.0`.
2. Build a `UserBatchContext` from `DAppConnector.getSigner(accountId)`,
   the payer account ID, and the account EVM address already used by the app.
3. Build the raw inners with `hliquityBatches.ts`.
4. Call `buildUserBatch(flow, context, { onProgress })`. The flow carries its own mandatory
   allowance expectation, derived from the same owner/token/spender/amount as the approval.
   Show the progress text before each of the three wallet prompts.
5. Pass the fully signed result to `useHederaBatch.executeBatch()`; this method
   only relays and verifies.
6. Gate the flow to HashPack >=14.4.0. Unknown versions and other wallets fail
   closed until independently validated.

## Required regression tests

- two-inner build invokes `signer.signTransaction` exactly three times;
- both signer-returned inner objects, not the originals, are present in the
  outer batch;
- the final outer contains the ephemeral batch-key signature;
- rejected prompt results in no call to `executeTransaction`;
- pre-existing allowance blocks relay;
- success requires parent `SUCCESS`, exact token debit, and zero allowance;
- SDK transaction IDs are normalized to Mirror REST format, and the parent plus
  both preserved inner IDs must each resolve to `SUCCESS` (`name`, not `type`);
- wrong contract target, truncated redemption, or amount above 1,780 HCHF is
  rejected before signing;
- close-trove ignores user-entered debt and uses fresh entire debt including
  pending rewards.

Smart-contract calls in Hedera atomic batches are planned for removal in March
2027. This frontend is a temporary mainnet exit bridge, not the long-term
protocol fix.
