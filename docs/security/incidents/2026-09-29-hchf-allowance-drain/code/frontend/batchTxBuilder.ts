// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// batchTxBuilder.ts - the NO-OPERATOR batch assembly pattern for the dapp context.
// There is no Client/operator in a browser wallet flow, so the CLI's
// freezeWith(client) + batchify(client, key) path (guide §4) is unavailable.
// This module builds and freezes inner transactions through the wallet signer instead.
//
// SIGNING MODEL (guide §4): every inner tx needs a batchKey (public key)
// set, and the OUTER batch must be signed by ALL distinct batchKey private keys plus
// the batch payer. With a single user batchKey on every inner, ONE wallet approval
// covers the whole batch.
//
// SIGNING UX - VALIDATED vs UNVALIDATED (guide changelog (C6)): the
// community-validated wallet pattern is PER-TRANSACTION signing - the wallet
// signs each inner + the outer separately (THREE HashPack prompts observed on
// mainnet for a 2-inner batch, via hedera-wallet-connect 1.5.1 + HashPack >=
// 14.4.0) and the dapp relays the signed bytes with hedera_executeTransaction -
// see useHederaBatch.ts (primary path). Single-prompt
// hedera_signAndExecuteTransaction is a SEPARATE, still-unvalidated path kept
// there as an option. This module only ASSEMBLES and serializes; it does not
// choose or perform the signing.
//
// *** NO-OPERATOR FREEZE + WALLET SIGNING (guide changelog (C1)): now
// COMMUNITY-VALIDATED on mainnet for the per-transaction signing path
// (hedera-wallet-connect 1.5.1 + HashPack >= 14.4.0; see useHederaBatch.ts).
// Still UNVERIFIED: how HashPack renders each inner at signing. Validate on
// testnet before mainnet per the frontend README test plan.

import {
  BatchTransaction,
  Transaction,
  TransactionId,
  type AccountId,
  type PublicKey,
  type Signer,
} from "@hashgraph/sdk";

/** Everything the builder needs from the connected wallet session. */
export interface UserBatchContext {
  /** The connected wallet account - becomes payer of every inner tx. */
  userAccountId: AccountId;
  /** The wallet account's public key - used as batchKey on every inner tx. */
  userPublicKey: PublicKey;
  /**
   * hedera-wallet-connect DAppSigner (HIP-820). Its freezeWithSigner(tx) fills
   * node account data without an operator client - the dapp-context equivalent of
   * freezeWith(client). SDK Signer interface method; behaviour with BatchTransaction
   * inners is part of the UNVERIFIED combination flagged above.
   */
  signer: Signer;
}

export interface BuiltUserBatch {
  batch: BatchTransaction;
  /** base64 protobuf TransactionList bytes - HIP-820 `transactionList` parameter. */
  transactionListBase64: string;
  /** Human-readable description of each inner, for the wallet prompt / UI. */
  innerDescriptions: string[];
}

/**
 * Prepare one inner transaction for batch membership:
 *   1. its own transaction id (payer = user account, guide §4 -
 *      "each has own payer + transactionId"; required here because payer != any
 *      operator);
 *   2. batchKey = user's public key (single-key signing model);
 *   3. frozen via the wallet signer - freezeWith(client) is unavailable in a
 *      dapp context (no operator client exists);
 * BatchTransaction.addInnerTransaction throws unless the inner is frozen AND
 * has a batchKey set (guide §4).
 */
export async function prepareInnerTransaction(
  inner: Transaction,
  ctx: UserBatchContext,
  description: string
): Promise<{ tx: Transaction; description: string }> {
  inner.setTransactionId(TransactionId.generate(ctx.userAccountId));
  inner.setBatchKey(ctx.userPublicKey);
  // No-operator freeze: community-validated for the per-transaction path
  // (guide changelog (C1)) - see file header. freezeWithSigner is a
  // Transaction method taking the signer (there is no operator client in a
  // dapp context - freezeWith(client) is unavailable).
  await inner.freezeWithSigner(ctx.signer);
  return { tx: inner, description };
}

/**
 * Assemble a user-signed-ready outer batch from prepared inners.
 * Order matters (guide §4): at most ONE inner that is a contract op
 * and it MUST be the LAST inner; builders in hliquityBatches.ts enforce
 * [optional TokenAssociate, AccountAllowanceApprove, ContractExecute].
 */
export async function buildUserBatch(
  prepared: Array<{ tx: Transaction; description: string }>,
  ctx: UserBatchContext
): Promise<BuiltUserBatch> {
  if (prepared.length === 0) throw new Error("buildUserBatch: no inner transactions");
  if (prepared.length > 25) {
    // guide §4: network config allows <=50; SDK JSDoc stale-says 25
    // ("plan <=25 to be safe"); total batch <= 6 KB.
    throw new Error(`buildUserBatch: ${prepared.length} inners exceeds the safe limit of 25`);
  }

  const batch = new BatchTransaction();
  for (const { tx } of prepared) {
    batch.addInnerTransaction(tx); // throws unless frozen + batchKey set
  }

  // Freeze the OUTER batch through the signer (same no-operator constraint,
  // community-validated per guide changelog C1).
  await batch.freezeWithSigner(ctx.signer);

  // Serialize for HIP-820: the validated flow sends these bytes via
  // hedera_signTransaction (wallet signs each inner + the outer - three
  // prompts - see useHederaBatch.ts and guide §6.4), then relays the
  // signed bytes with hedera_executeTransaction. The single-prompt
  // hedera_signAndExecuteTransaction path is a separate UNVALIDATED option.
  const transactionListBase64 = Buffer.from(batch.toBytes()).toString("base64");

  return {
    batch,
    transactionListBase64,
    innerDescriptions: prepared.map((p) => p.description),
  };
}
