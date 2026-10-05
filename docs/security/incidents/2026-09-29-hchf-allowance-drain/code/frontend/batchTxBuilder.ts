// Reference artifact for the batch-transaction exit guide.
//
// This is the exact signing shape reproduced successfully on Hedera mainnet with
// @hashgraph/hedera-wallet-connect 1.5.1 and HashPack >= 14.4.0. Do not replace
// the three explicit signer calls with one signTransaction call on the outer
// batch: DAppSigner returns a NEW signed transaction for each request.

import { transactionToBase64String } from "@hashgraph/hedera-wallet-connect";
import {
  AccountAllowanceApproveTransaction,
  BatchTransaction,
  ContractExecuteTransaction,
  Hbar,
  PrivateKey,
  Transaction,
  TransactionId,
  type AccountId,
  type Signer,
} from "@hashgraph/sdk";

export interface UserBatchContext {
  /** Connected wallet account; payer of both inners and the outer batch. */
  userAccountId: AccountId;
  /** DAppSigner returned by DAppConnector.getSigner(accountId). */
  signer: Signer;
  /** EVM address used by the existing frontend for borrower-state reads. */
  userEvmAddress: `0x${string}`;
}

export interface PreparedInner {
  tx: Transaction;
  description: string;
}

export interface AllowanceExpectation {
  ownerAccountId: string;
  tokenId: string;
  spenderAccountId: string;
  /** Exact token debit expected from the consuming call. */
  expectedDebitUnits: string;
}

export interface BuiltUserBatch {
  /** Fully signed outer batch, including the ephemeral batch-key signature. */
  batch: BatchTransaction;
  /** Base64 protobuf TransactionList passed unchanged to hedera_executeTransaction. */
  transactionListBase64: string;
  /** Exact SDK-generated IDs used to verify both inners independently. */
  innerTransactionIds: string[];
  innerDescriptions: string[];
  allowanceExpectation: AllowanceExpectation;
}

export interface PreparedAllowanceFlow {
  /** Exactly [native token allowance approval, final contract operation]. */
  inners: [PreparedInner, PreparedInner];
  /** Derived from the same token, spender, owner, and amount as the approval. */
  allowanceExpectation: AllowanceExpectation;
}

export type BatchSigningStage =
  | "sign-inner"
  | "sign-outer"
  | "sign-batch-key";

export interface BatchSigningProgress {
  stage: BatchSigningStage;
  promptNumber?: number;
  promptCount?: number;
  description: string;
}

/**
 * Builders return unfrozen inners. Signing is intentionally centralized in
 * buildUserBatch so every inner receives the SAME one-use batch key.
 */
export function prepareInnerTransaction(
  inner: Transaction,
  _ctx: UserBatchContext,
  description: string
): PreparedInner {
  return { tx: inner, description };
}

async function signInnerTransaction<T extends Transaction>(
  transaction: T,
  ctx: UserBatchContext,
  batchKey: PrivateKey
): Promise<T> {
  transaction.setBatchKey(batchKey.publicKey);
  transaction.setTransactionId(TransactionId.generate(ctx.userAccountId));

  // Batch inners use Hedera's synthetic 0.0.0 node. Calling
  // freezeWithSigner() here lets DAppSigner.populateTransaction() install and
  // lock ordinary consensus nodes, which is not the mainnet-proven path.
  transaction.freeze();

  // DAppSigner 1.5.1 returns a NEW transaction containing the HashPack
  // signature. Transaction.signWithSigner() discards that return value, so the
  // returned object is load-bearing and must be retained.
  return ctx.signer.signTransaction(transaction);
}

/**
 * Sign and assemble an atomic user batch using the exact mainnet-proven flow:
 *
 *  1. fresh in-memory ED25519 batch key;
 *  2. separately sign every frozen inner in HashPack and retain each returned
 *     transaction;
 *  3. assemble and freeze the outer batch;
 *  4. sign the outer in HashPack and retain the returned transaction;
 *  5. add the ephemeral batch-key signature locally;
 *  6. serialize once for non-mutating relay.
 *
 * A two-inner approve+call batch therefore produces three HashPack prompts.
 * If any prompt is rejected, nothing has been submitted and no allowance is
 * created on-chain.
 */
export async function buildUserBatch(
  flow: PreparedAllowanceFlow,
  ctx: UserBatchContext,
  options: {
    onProgress?: (progress: BatchSigningProgress) => void;
  } = {}
): Promise<BuiltUserBatch> {
  const prepared = flow.inners as PreparedInner[];
  if (
    prepared.length !== 2 ||
    !(prepared[0].tx instanceof AccountAllowanceApproveTransaction) ||
    !(prepared[1].tx instanceof ContractExecuteTransaction)
  ) {
    throw new Error(
      "buildUserBatch only accepts [AccountAllowanceApproveTransaction, ContractExecuteTransaction]"
    );
  }

  const batchKey = PrivateKey.generateED25519();
  const signedInners: Transaction[] = [];

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    options.onProgress?.({
      stage: "sign-inner",
      promptNumber: index + 1,
      promptCount: prepared.length + 1,
      description: item.description,
    });
    signedInners.push(await signInnerTransaction(item.tx, ctx, batchKey));
  }
  const innerTransactionIds = signedInners.map((inner, index) => {
    if (!inner.transactionId) {
      throw new Error(`signed inner ${index + 1} has no transaction id`);
    }
    return inner.transactionId.toString();
  });

  const batch = new BatchTransaction({ transactions: signedInners })
    .setMaxTransactionFee(new Hbar(2))
    .setTransactionMemo("HLiquity atomic allowance-safe operation");

  await batch.freezeWithSigner(ctx.signer);
  options.onProgress?.({
    stage: "sign-outer",
    promptNumber: prepared.length + 1,
    promptCount: prepared.length + 1,
    description: "Sign the outer atomic batch",
  });

  const walletSignedBatch = await ctx.signer.signTransaction(batch);
  options.onProgress?.({
    stage: "sign-batch-key",
    description: "Add the one-use batch-key signature locally",
  });
  await walletSignedBatch.sign(batchKey);

  return {
    batch: walletSignedBatch,
    transactionListBase64: transactionToBase64String(walletSignedBatch),
    innerTransactionIds,
    innerDescriptions: prepared.map((item) => item.description),
    allowanceExpectation: flow.allowanceExpectation,
  };
}
