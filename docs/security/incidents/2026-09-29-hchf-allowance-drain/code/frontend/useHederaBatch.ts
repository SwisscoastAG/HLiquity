// Reference artifact for the batch-transaction exit guide.
//
// buildUserBatch() has already collected the two inner signatures, the outer
// wallet signature, and the ephemeral batch-key signature. This hook only
// relays those immutable bytes and verifies the consensus/post-state result.

import { useCallback, useRef, useState } from "react";
import type { AllowanceExpectation, BuiltUserBatch } from "./batchTxBuilder";

export type BatchLifecycle =
  | "idle"
  | "building"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "failed";

export interface InnerStatus {
  transactionId: string;
  nonce: number;
  type: string;
  result: string;
}

export interface BatchExecutionResult {
  batchId: string;
  parentStatus: string;
  inners: InnerStatus[];
  mirrorUrl: string;
  allowanceAfterUnits?: string;
  tokenDebitUnits?: string;
}

export interface BatchError {
  code:
    | "USER_REJECTED"
    | "INNER_TRANSACTION_FAILED"
    | "INVALID_TRANSACTION_BODY"
    | "PREEXISTING_ALLOWANCE"
    | "ALLOWANCE_RESIDUE"
    | "TOKEN_DEBIT_MISMATCH"
    | "TIMEOUT"
    | "UNKNOWN";
  message: string;
}

/** hedera-wallet-connect 1.5.1 relay surface used by the successful mainnet test. */
export interface WalletBatchConnector {
  executeTransaction(params: {
    transactionList: string;
  }): Promise<unknown>;
}

/** @deprecated Use WalletBatchConnector. */
export type SignAndExecuteConnector = WalletBatchConnector;

interface MirrorTransactionRow {
  batch_key: unknown | null;
  transaction_id: string;
  name: string;
  result: string | null;
  consensus_timestamp: string | null;
  parent_consensus_timestamp: string | null;
  nonce: number | null;
}

/** Mirror REST uses account-seconds-nanos while SDK TransactionId.toString() uses account@seconds.nanos. */
export function mirrorTransactionId(transactionId: string): string {
  const sdkId = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{1,9})$/.exec(transactionId);
  if (!sdkId) return transactionId;
  return `${sdkId[1]}-${sdkId[2]}-${sdkId[3].padStart(9, "0")}`;
}

interface MirrorAllowanceResponse {
  allowances?: Array<{
    amount: number | string;
    spender: string;
    token_id: string;
  }>;
}

interface MirrorTokenResponse {
  tokens?: Array<{
    balance: number | string;
    token_id: string;
  }>;
}

function userMessageFor(err: unknown): BatchError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/reject|declin|cancel|denied/i.test(msg)) {
    return { code: "USER_REJECTED", message: "You declined the request in the wallet. Nothing was submitted." };
  }
  if (/PREEXISTING_ALLOWANCE/i.test(msg)) {
    return {
      code: "PREEXISTING_ALLOWANCE",
      message: "Submission blocked: a spendable allowance already exists. Revoke it before rebuilding the batch.",
    };
  }
  if (/ALLOWANCE_RESIDUE/i.test(msg)) {
    return {
      code: "ALLOWANCE_RESIDUE",
      message:
        "CRITICAL: the batch committed but a wrapper allowance remains. Stop other actions and submit an exact zero-allowance revocation immediately.",
    };
  }
  if (/TOKEN_DEBIT_MISMATCH/i.test(msg)) {
    return {
      code: "TOKEN_DEBIT_MISMATCH",
      message:
        "CRITICAL: the token balance did not change by the exact approved amount. Treat this as a possible allowance sweep and inspect the account immediately.",
    };
  }
  if (/INNER_TRANSACTION_FAILED/i.test(msg)) {
    return {
      code: "INNER_TRANSACTION_FAILED",
      message:
        "The batch rolled back atomically: the approval and operation were not committed. Fees for earlier inners may still be charged.",
    };
  }
  if (/INVALID_TRANSACTION_BODY/i.test(msg)) {
    return {
      code: "INVALID_TRANSACTION_BODY",
      message: "The network rejected the batch shape. The single contract call must be the final inner.",
    };
  }
  if (/TIMEOUT/i.test(msg)) {
    return { code: "TIMEOUT", message: msg };
  }
  return { code: "UNKNOWN", message: `Batch failed: ${msg}` };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`mirror node HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function readAllowance(mirror: string, expectation: AllowanceExpectation): Promise<bigint> {
  const query = new URLSearchParams({
    "spender.id": expectation.spenderAccountId,
    "token.id": expectation.tokenId,
    limit: "1",
  });
  const data = (await fetchJson(
    `${mirror}/api/v1/accounts/${expectation.ownerAccountId}/allowances/tokens?${query.toString()}`,
    15_000
  )) as MirrorAllowanceResponse | null;
  const row = data?.allowances?.find(
    (candidate) =>
      candidate.token_id === expectation.tokenId &&
      candidate.spender === expectation.spenderAccountId
  );
  return row ? BigInt(row.amount) : 0n;
}

async function readTokenBalance(mirror: string, expectation: AllowanceExpectation): Promise<bigint> {
  const data = (await fetchJson(
    `${mirror}/api/v1/accounts/${expectation.ownerAccountId}/tokens?token.id=${expectation.tokenId}&limit=1`,
    15_000
  )) as MirrorTokenResponse | null;
  const row = data?.tokens?.find((candidate) => candidate.token_id === expectation.tokenId);
  return row ? BigInt(row.balance) : 0n;
}

async function pollBatchOnMirror(
  mirror: string,
  batchId: string,
  innerTransactionIds: string[],
  timeoutMs = 60_000,
  intervalMs = 3_000
): Promise<BatchExecutionResult> {
  const parentMirrorId = mirrorTransactionId(batchId);
  const innerMirrorIds = innerTransactionIds.map(mirrorTransactionId);
  const url = `${mirror}/api/v1/transactions/${parentMirrorId}`;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const [parentData, ...innerData] = (await Promise.all([
      fetchJson(url, 15_000),
      ...innerMirrorIds.map((id) =>
        fetchJson(`${mirror}/api/v1/transactions/${id}`, 15_000)
      ),
    ])) as Array<{ transactions?: MirrorTransactionRow[] } | null>;

    const parent = parentData?.transactions?.find(
      (row) =>
        row.transaction_id === parentMirrorId &&
        row.name === "ATOMICBATCH" &&
        row.parent_consensus_timestamp === null
    );
    if (parent?.consensus_timestamp) {
      const innerRows = innerData.map((data, index) =>
        data?.transactions?.find(
          (row) =>
            row.transaction_id === innerMirrorIds[index] &&
            row.parent_consensus_timestamp === parent.consensus_timestamp &&
            row.batch_key !== null
        )
      );
      if (innerRows.every((row): row is MirrorTransactionRow => row !== undefined)) {
        const inners = innerRows.map((row) => ({
          transactionId: row.transaction_id,
          nonce: row.nonce ?? 0,
          type: row.name,
          result: row.result ?? "UNKNOWN",
        }));
        return {
          batchId: parent.transaction_id,
          parentStatus: parent.result ?? "UNKNOWN",
          inners,
          mirrorUrl: url,
        };
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`TIMEOUT: batch ${batchId} was not visible after ${timeoutMs / 1000}s`);
    }
    await wait(intervalMs);
  }
}

async function verifyPostState(
  mirror: string,
  expectation: AllowanceExpectation,
  balanceBefore: bigint
): Promise<{ allowanceAfter: bigint; tokenDebit: bigint }> {
  const expectedDebit = BigInt(expectation.expectedDebitUnits);
  let allowanceAfter = 0n;
  let balanceAfter = balanceBefore;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    [allowanceAfter, balanceAfter] = await Promise.all([
      readAllowance(mirror, expectation),
      readTokenBalance(mirror, expectation),
    ]);
    if (allowanceAfter === 0n && balanceBefore - balanceAfter === expectedDebit) {
      return { allowanceAfter, tokenDebit: expectedDebit };
    }
    await wait(1_000);
  }

  if (allowanceAfter !== 0n) {
    throw new Error(`ALLOWANCE_RESIDUE: ${allowanceAfter.toString()} native units remain`);
  }
  throw new Error(
    `TOKEN_DEBIT_MISMATCH: expected ${expectedDebit.toString()}, observed ${(balanceBefore - balanceAfter).toString()}`
  );
}

export interface UseHederaBatch {
  status: BatchLifecycle;
  error: BatchError | null;
  result: BatchExecutionResult | null;
  statusMessage: string | null;
  setBuilding: (on: boolean) => void;
  executeBatch: (built: BuiltUserBatch, batchId?: string) => Promise<BatchExecutionResult | null>;
  reset: () => void;
}

export function useHederaBatch(
  connector: WalletBatchConnector | null,
  mirror: string
): UseHederaBatch {
  const [status, setStatus] = useState<BatchLifecycle>("idle");
  const [error, setError] = useState<BatchError | null>(null);
  const [result, setResult] = useState<BatchExecutionResult | null>(null);
  const activeRef = useRef(false);

  const reset = useCallback(() => {
    activeRef.current = false;
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  const setBuilding = useCallback((on: boolean) => {
    setStatus(on ? "building" : "idle");
  }, []);

  const executeBatch = useCallback(
    async (built: BuiltUserBatch, suppliedBatchId?: string): Promise<BatchExecutionResult | null> => {
      if (!connector) {
        setError({ code: "UNKNOWN", message: "Wallet not connected." });
        setStatus("failed");
        return null;
      }
      if (activeRef.current) return null;
      activeRef.current = true;
      setError(null);
      setResult(null);

      try {
        const expectation = built.allowanceExpectation;
        const [allowanceBefore, balanceBefore] = await Promise.all([
          readAllowance(mirror, expectation),
          readTokenBalance(mirror, expectation),
        ]);
        if (allowanceBefore !== 0n) {
          throw new Error(`PREEXISTING_ALLOWANCE: ${allowanceBefore.toString()} native units`);
        }

        const batchId = suppliedBatchId ?? built.batch.transactionId?.toString();
        if (!batchId) throw new Error("Fully signed batch has no transaction id");

        setStatus("submitted");
        await connector.executeTransaction({
          transactionList: built.transactionListBase64,
        });

        const outcome = await pollBatchOnMirror(
          mirror,
          batchId,
          built.innerTransactionIds
        );
        if (outcome.parentStatus !== "SUCCESS") {
          throw new Error(outcome.parentStatus);
        }
        const failedInner = outcome.inners.find((inner) => inner.result !== "SUCCESS");
        if (failedInner) {
          throw new Error(
            `INNER_TRANSACTION_FAILED: ${failedInner.transactionId} returned ${failedInner.result}`
          );
        }

        const postState = await verifyPostState(mirror, expectation, balanceBefore);
        outcome.allowanceAfterUnits = postState.allowanceAfter.toString();
        outcome.tokenDebitUnits = postState.tokenDebit.toString();

        setResult(outcome);
        setStatus("confirmed");
        return outcome;
      } catch (cause) {
        setError(userMessageFor(cause));
        setStatus("failed");
        return null;
      } finally {
        activeRef.current = false;
      }
    },
    [connector, mirror]
  );

  const statusMessage =
    status === "building"
      ? "Build and sign each inner, then the outer batch. A two-inner batch produces three HashPack prompts."
      : status === "submitted"
        ? "Fully signed batch submitted; waiting for consensus and exact zero-residue verification."
        : status === "confirmed"
          ? "Batch confirmed and post-state verified."
          : null;

  return { status, error, result, statusMessage, setBuilding, executeBatch, reset };
}
