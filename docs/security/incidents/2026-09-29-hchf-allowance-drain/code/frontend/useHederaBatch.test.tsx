// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchTransaction } from "@hashgraph/sdk";
import type { BuiltUserBatch } from "./batchTxBuilder";
import { mirrorTransactionId, useHederaBatch } from "./useHederaBatch";

const parentId = "0.0.4093645@1791199479.519938818";
const approvalId = "0.0.4093645@1791199478.045553448";
const redemptionId = "0.0.4093645@1791199481.019245284";
const parentConsensus = "1791199492.854538104";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("mainnet-proven batch relay and post-state", () => {
  afterEach(() => vi.restoreAllMocks());

  it("relays exact bytes, confirms parent and both inner IDs, then proves exact debit and zero allowance", async () => {
    let tokenBalanceReads = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith(`/transactions/${mirrorTransactionId(parentId)}`)) {
        return jsonResponse({
          transactions: [{
            transaction_id: mirrorTransactionId(parentId),
            name: "ATOMICBATCH",
            result: "SUCCESS",
            consensus_timestamp: parentConsensus,
            parent_consensus_timestamp: null,
            nonce: 0,
            batch_key: null,
          }],
        });
      }
      if (url.endsWith(`/transactions/${mirrorTransactionId(approvalId)}`)) {
        return jsonResponse({
          transactions: [{
            transaction_id: mirrorTransactionId(approvalId),
            name: "CRYPTOAPPROVEALLOWANCE",
            result: "SUCCESS",
            consensus_timestamp: "1791199492.854538105",
            parent_consensus_timestamp: parentConsensus,
            nonce: 0,
            batch_key: { _type: "ED25519", key: "fixture" },
          }],
        });
      }
      if (url.endsWith(`/transactions/${mirrorTransactionId(redemptionId)}`)) {
        return jsonResponse({
          transactions: [{
            transaction_id: mirrorTransactionId(redemptionId),
            name: "CONTRACTCALL",
            result: "SUCCESS",
            consensus_timestamp: "1791199492.854538106",
            parent_consensus_timestamp: parentConsensus,
            nonce: 0,
            batch_key: { _type: "ED25519", key: "fixture" },
          }],
        });
      }
      if (url.includes("/allowances/tokens?")) {
        return jsonResponse({ allowances: [] });
      }
      if (url.includes("/tokens?token.id=0.0.6070123")) {
        tokenBalanceReads += 1;
        return jsonResponse({
          tokens: [{
            token_id: "0.0.6070123",
            balance: tokenBalanceReads === 1 ? "200000004" : "100000004",
          }],
        });
      }
      throw new Error(`unexpected Mirror request: ${url}`);
    });

    const connector = { executeTransaction: vi.fn().mockResolvedValue({}) };
    const built: BuiltUserBatch = {
      batch: { transactionId: { toString: () => parentId } } as unknown as BatchTransaction,
      transactionListBase64: "fully-signed-fixture",
      innerTransactionIds: [approvalId, redemptionId],
      innerDescriptions: ["Approve exactly 1 HCHF", "Redeem exactly 1 HCHF"],
      allowanceExpectation: {
        ownerAccountId: "0.0.4093645",
        tokenId: "0.0.6070123",
        spenderAccountId: "0.0.6070122",
        expectedDebitUnits: "100000000",
      },
    };

    const { result } = renderHook(() =>
      useHederaBatch(connector, "https://mainnet-public.mirrornode.hedera.com")
    );
    let outcome;
    await act(async () => {
      outcome = await result.current.executeBatch(built);
    });

    expect(connector.executeTransaction).toHaveBeenCalledWith({
      transactionList: "fully-signed-fixture",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/${mirrorTransactionId(parentId)}`,
      expect.any(Object)
    );
    expect(result.current.status).toBe("confirmed");
    expect(outcome).toMatchObject({
      parentStatus: "SUCCESS",
      tokenDebitUnits: "100000000",
      allowanceAfterUnits: "0",
      inners: [
        { type: "CRYPTOAPPROVEALLOWANCE", result: "SUCCESS" },
        { type: "CONTRACTCALL", result: "SUCCESS" },
      ],
    });
  });

  it("normalizes the SDK transaction ID to the live Mirror REST format", () => {
    expect(mirrorTransactionId(parentId)).toBe(
      "0.0.4093645-1791199479-519938818"
    );
  });
});
