import { describe, expect, it } from "vitest";
import {
  AccountAllowanceApproveTransaction,
  AccountId,
  ContractExecuteTransaction,
  Hbar,
  LedgerId,
  Long,
  PrivateKey,
  TokenId,
  Transaction,
  TransactionId,
  type Signer,
} from "@hashgraph/sdk";
import {
  buildUserBatch,
  prepareInnerTransaction,
  type PreparedAllowanceFlow,
  type UserBatchContext,
} from "./batchTxBuilder";

// Regression fixture for the exact signing sequence that succeeded in mainnet
// parent transaction 0.0.4093645@1791199479.519938818. The mock deliberately
// returns a NEW signed object, matching DAppSigner 1.5.1 behavior.
function createReturningSigner(accountId: AccountId) {
  const walletKey = PrivateKey.generateED25519();
  const signedInputs: Transaction[] = [];
  const signedReturns: Transaction[] = [];

  const signer = {
    getLedgerId: () => LedgerId.MAINNET,
    getAccountId: () => accountId,
    getNetwork: () => ({ "0.0.3": AccountId.fromString("0.0.3") }),
    getMirrorNetwork: () => ["mainnet-public.mirrornode.hedera.com:443"],
    populateTransaction: async <T extends Transaction>(transaction: T): Promise<T> => {
      if (!transaction.transactionId) {
        transaction.setTransactionId(TransactionId.generate(accountId));
      }
      transaction.setNodeAccountIds([AccountId.fromString("0.0.3")]);
      return transaction;
    },
    signTransaction: async <T extends Transaction>(transaction: T): Promise<T> => {
      signedInputs.push(transaction);
      const returned = Transaction.fromBytes(transaction.toBytes()) as T;
      await returned.sign(walletKey);
      signedReturns.push(returned);
      return returned;
    },
  } as unknown as Signer;

  return { signer, signedInputs, signedReturns };
}

describe("mainnet-proven atomic batch signing", () => {
  it("retains both signer-returned inners, signs the outer third, and serializes the result", async () => {
    const accountId = AccountId.fromString("0.0.4093645");
    const { signer, signedInputs, signedReturns } = createReturningSigner(accountId);
    const ctx: UserBatchContext = {
      userAccountId: accountId,
      signer,
      userEvmAddress: `0x${accountId.toSolidityAddress()}`,
    };

    const approval = new AccountAllowanceApproveTransaction().approveTokenAllowance(
      TokenId.fromString("0.0.6070123"),
      accountId,
      AccountId.fromString("0.0.6070122"),
      Long.fromString("100000000", true, 10)
    );
    const redemption = new ContractExecuteTransaction()
      .setContractId("0.0.6070118")
      .setGas(3_000_000)
      .setPayableAmount(Hbar.fromTinybars(0));

    const flow: PreparedAllowanceFlow = {
      inners: [
        prepareInnerTransaction(approval, ctx, "Approve exactly 1 HCHF"),
        prepareInnerTransaction(redemption, ctx, "Redeem exactly 1 HCHF"),
      ],
      allowanceExpectation: {
        ownerAccountId: "0.0.4093645",
        tokenId: "0.0.6070123",
        spenderAccountId: "0.0.6070122",
        expectedDebitUnits: "100000000",
      },
    };

    const progress: string[] = [];
    const built = await buildUserBatch(flow, ctx, {
      onProgress: ({ stage }) => progress.push(stage),
    });

    expect(signedInputs).toHaveLength(3);
    expect(signedReturns).toHaveLength(3);
    expect(built.batch).toBe(signedReturns[2]);
    expect(built.batch.innerTransactions[0]).not.toBe(approval);
    expect(built.batch.innerTransactions[1]).not.toBe(redemption);
    expect(built.innerDescriptions).toEqual([
      "Approve exactly 1 HCHF",
      "Redeem exactly 1 HCHF",
    ]);
    expect(built.innerTransactionIds).toHaveLength(2);
    expect(built.allowanceExpectation.expectedDebitUnits).toBe("100000000");
    expect(progress).toEqual(["sign-inner", "sign-inner", "sign-outer", "sign-batch-key"]);
    expect(built.transactionListBase64.length).toBeGreaterThan(0);
  });

  it("fails closed when the exact approval is not the first inner", async () => {
    const accountId = AccountId.fromString("0.0.4093645");
    const { signer } = createReturningSigner(accountId);
    const ctx: UserBatchContext = {
      userAccountId: accountId,
      signer,
      userEvmAddress: `0x${accountId.toSolidityAddress()}`,
    };
    const contract = prepareInnerTransaction(
      new ContractExecuteTransaction().setContractId("0.0.6070118").setGas(100_000),
      ctx,
      "wrong first inner"
    );

    const invalid = {
      inners: [contract, contract],
      allowanceExpectation: {
        ownerAccountId: "0.0.4093645",
        tokenId: "0.0.6070123",
        spenderAccountId: "0.0.6070122",
        expectedDebitUnits: "100000000",
      },
    } as unknown as PreparedAllowanceFlow;

    await expect(buildUserBatch(invalid, ctx)).rejects.toThrow(
      "AccountAllowanceApproveTransaction"
    );
  });
});
