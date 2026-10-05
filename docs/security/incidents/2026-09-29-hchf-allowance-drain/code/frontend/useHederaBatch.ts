// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// useHederaBatch.ts - React hook: send a built batch through the wallet connector and
// watch it on the mirror node.
//
// SIGNING PATHS (guide changelog (C6)):
//
// PRIMARY - COMMUNITY-VALIDATED ("per-transaction"): request a signature via
// hedera_signTransaction on the frozen outer batch; the wallet signs EACH inner
// transaction and then the outer batch SEPARATELY - a community contributor's
// mainnet reproduction observed THREE HashPack prompts (one per inner + one for
// the outer, for the standard 2-inner approve+call batch) with
// hedera-wallet-connect 1.5.1 + HashPack >= 14.4.0 - and the dapp then relays the
// signed bytes with hedera_executeTransaction. This is the validated pattern.
//
// SECONDARY - UNVALIDATED ("single-prompt"): hedera_signAndExecuteTransaction
// (wallet signs and submits its own bytes in ONE prompt). Kept as a convenience
// option but NOT validated by the community test - see signingInfo.validated.
//
// ISSUE #694 CAVEAT (hedera-wallet-connect): on SOME connector versions
// DAppSigner.signTransaction REBUILDS the ContractExecute body, so the returned
// signature covers different bytes than the dapp sent. This is a
// VERSION-DEPENDENT caveat for sign-then-relay flows - it does NOT invalidate
// the community-validated 1.5.1 path above. This hook keeps a runtime guard:
// bytes returned from signing must decode AND carry the same transaction id we
// sent (a rebuilt body yields a different id) - see verifySignedBytes().
//
// The no-operator freeze + wallet signing combination is now COMMUNITY-VALIDATED
// (guide changelog (C1)) for the per-transaction path. Still UNVERIFIED:
// how HashPack renders each inner at signing (per the issue, prompts were
// observed one per transaction; what each prompt displays is untested).

import { useCallback, useRef, useState } from "react";
import { Transaction } from "@hashgraph/sdk";
import type { BuiltUserBatch } from "./batchTxBuilder";

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
  type: string; // e.g. CRYPTOAPPROVEALLOWANCE / CONTRACTCALL
  result: string; // e.g. SUCCESS / INNER_TRANSACTION_FAILED
}

export interface BatchExecutionResult {
  batchId: string;
  parentStatus: string;
  inners: InnerStatus[];
  mirrorUrl: string;
}

export interface BatchError {
  code:
    | "USER_REJECTED"
    | "INNER_TRANSACTION_FAILED"
    | "INVALID_TRANSACTION_BODY"
    | "SIGNATURE_MISMATCH"
    | "TIMEOUT"
    | "UNKNOWN";
  message: string; // user-facing, safe to render
}

/**
 * Minimal surface of hedera-wallet-connect's DAppConnector used here (HIP-820).
 * All three methods take the base64 protobuf TransactionList.
 */
export interface WalletBatchConnector {
  /**
   * hedera_signTransaction - sign-only. In the validated per-transaction flow
   * the dapp sends the frozen OUTER batch; the wallet signs each inner
   * transaction and the outer separately (THREE prompts for the standard
   * 2-inner batch) and returns the fully signed bytes for relay.
   */
  signTransaction(params: {
    transactionList: string; // base64 protobuf TransactionList
    signerAccountId: string; // "0.0.x"
  }): Promise<unknown>;
  /** hedera_executeTransaction - relay an already-signed batch (validated path). */
  executeTransaction(params: {
    transactionList: string; // base64 protobuf TransactionList (SIGNED)
    signerAccountId: string; // "0.0.x"
  }): Promise<unknown>;
  /** hedera_signAndExecuteTransaction - single-prompt sign+submit (UNVALIDATED). */
  signAndExecuteTransaction(params: {
    transactionList: string; // base64 protobuf TransactionList
    signerAccountId: string; // "0.0.x"
  }): Promise<unknown>;
}

/** @deprecated Use WalletBatchConnector. Kept for existing call sites. */
export type SignAndExecuteConnector = WalletBatchConnector;

/** How the wallet signs the batch - see guide changelog (C6) and file header. */
export type SigningPath = "per-transaction" | "single-prompt";

export interface SigningPathInfo {
  mode: SigningPath;
  /** true = reproduced on mainnet by a community contributor (guide changelog C6). */
  communityValidated: boolean;
  /** Wallet prompts the UI should tell the user to expect. */
  expectedPrompts: number;
  /** Short UI hint describing the path. */
  hint: string;
}

export const SIGNING_PATHS: Record<SigningPath, SigningPathInfo> = {
  "per-transaction": {
    mode: "per-transaction",
    communityValidated: true,
    expectedPrompts: 3, // one per inner + one for the outer batch (2-inner batch)
    hint: "Validated on mainnet (community contributor): hedera-wallet-connect 1.5.1 + HashPack >= 14.4.0. The wallet signs each inner transaction and then the outer batch - expect THREE signing prompts - and the dapp relays via hedera_executeTransaction.",
  },
  "single-prompt": {
    mode: "single-prompt",
    communityValidated: false,
    expectedPrompts: 1,
    hint: "hedera_signAndExecuteTransaction: one prompt, the wallet signs and submits. UNVALIDATED path (guide changelog (C6)) - kept as an option only.",
  },
};

export interface UseHederaBatchOptions {
  /**
   * "per-transaction" (DEFAULT) = community-validated 3-prompt pattern:
   * hedera_signTransaction, then hedera_executeTransaction relay.
   * "single-prompt" = hedera_signAndExecuteTransaction, UNVALIDATED.
   */
  signingPath?: SigningPath;
}

/** Mirror-node transaction row (fields we use). */
interface MirrorTransactionRow {
  transaction_id: string;
  type: string;
  result: string | null;
  consensus_timestamp: string | null;
  parent_consensus_timestamp: string | null;
  nonce: number | null;
}

function userMessageFor(err: unknown): BatchError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/reject|declin|cancel|denied/i.test(msg)) {
    return { code: "USER_REJECTED", message: "You declined the request in the wallet. Nothing was submitted." };
  }
  if (/INNER_TRANSACTION_FAILED/i.test(msg)) {
    return {
      code: "INNER_TRANSACTION_FAILED",
      message:
        "The batch rolled back atomically: the approval and the operation were NOT committed, so no allowance was left exposed. " +
        "Fees for inner transactions that ran before the failure may still be charged. " +
        "Common causes: stale redemption price/hints or an insufficient token balance. Check the residue allowance and retry.",
    };
  }
  if (/INVALID_TRANSACTION_BODY/i.test(msg)) {
    return {
      code: "INVALID_TRANSACTION_BODY",
      message:
        "The network rejected the batch shape: at most ONE contract call is allowed and it must be the LAST inner transaction. " +
        "Rebuild the batch (approve first, contract call last).",
    };
  }
  if (/signature|body mismatch|rebuilt/i.test(msg)) {
    return {
      code: "SIGNATURE_MISMATCH",
      message:
        "The wallet returned signed bytes that do not match the batch you reviewed (connector body-rebuild behavior, " +
        "hedera-wallet-connect issue #694 class). Nothing was submitted. Update hedera-wallet-connect to the " +
        "community-validated 1.5.1 line and retry.",
    };
  }
  return { code: "UNKNOWN", message: `Batch failed: ${msg}` };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`mirror node HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll the mirror node for the ATOMICBATCH parent and its inners
 * (guide §4: inners carry `parent_consensus_timestamp` linking them to
 * the parent, plus `nonce`). Resolves with per-inner statuses.
 */
async function pollBatchOnMirror(
  mirror: string,
  batchId: string,
  timeoutMs = 60_000,
  intervalMs = 3_000
): Promise<BatchExecutionResult> {
  const url = `${mirror}/api/v1/transactions/${encodeURIComponent(batchId)}`;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const data = (await fetchJson(url, 15_000)) as { transactions?: MirrorTransactionRow[] } | null;
    const rows = data?.transactions ?? [];
    const parent = rows.find((r) => r.type === "ATOMICBATCH");
    if (parent && parent.consensus_timestamp) {
      const inners = rows
        .filter((r) => r.parent_consensus_timestamp === parent.consensus_timestamp)
        .sort((a, b) => (a.nonce ?? 0) - (b.nonce ?? 0))
        .map((r) => ({
          transactionId: r.transaction_id,
          nonce: r.nonce ?? 0,
          type: r.type,
          result: r.result ?? "UNKNOWN",
        }));
      return {
        batchId: parent.transaction_id,
        parentStatus: parent.result ?? "UNKNOWN",
        inners,
        mirrorUrl: url,
      };
    }
    if (Date.now() > deadline) {
      throw new Error(`TIMEOUT: batch ${batchId} not visible on the mirror node after ${timeoutMs / 1000}s - check ${url} manually`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export interface UseHederaBatch {
  status: BatchLifecycle;
  error: BatchError | null;
  result: BatchExecutionResult | null;
  /** Active signing path (default "per-transaction" = community-validated). */
  signingPath: SigningPath;
  /** Metadata about the active path: validated or not, prompts to expect, UI hint. */
  signingInfo: SigningPathInfo;
  /** User-facing copy for the current status; surfaces "expect 3 signing prompts". */
  statusMessage: string | null;
  /** Build-phase signal for the UI spinner. */
  setBuilding: (on: boolean) => void;
  executeBatch: (built: BuiltUserBatch, batchId: string) => Promise<BatchExecutionResult | null>;
  reset: () => void;
}

/** Coerce a HIP-820 response ({ transactionList: base64 } | plain base64 string) to bytes. */
function signedBytesFromResponse(response: unknown): Uint8Array {
  const base64 =
    typeof response === "string"
      ? response
      : (response as { transactionList?: unknown } | null)?.transactionList;
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new Error("wallet returned no signed transaction bytes");
  }
  return Buffer.from(base64, "base64");
}

/**
 * Runtime consistency guard for sign-then-relay (see file header): the signed
 * bytes must decode as a Hedera transaction AND carry the SAME transaction id
 * we sent. A connector affected by the version-dependent body-rebuild behavior
 * (hedera-wallet-connect issue #694 class) returns bytes whose id no longer
 * matches - meaning the user reviewed different bytes than would be relayed.
 * Throws on mismatch; nothing is submitted.
 */
function verifySignedBytes(sent: Transaction, signedBytes: Uint8Array): void {
  let decoded: Transaction;
  try {
    decoded = Transaction.fromBytes(signedBytes);
  } catch {
    throw new Error("signature/body mismatch: wallet returned bytes that do not decode as a Hedera transaction");
  }
  const sentId = sent.transactionId ? sent.transactionId.toString() : null;
  const signedId = decoded.transactionId ? decoded.transactionId.toString() : null;
  if (!sentId || !signedId || sentId !== signedId) {
    throw new Error(`signature/body mismatch: signed transaction id ${signedId} does not match requested ${sentId}`);
  }
}

/** User-facing status copy; the awaiting-signature state tells the UI what to expect. */
function statusMessageFor(status: BatchLifecycle, info: SigningPathInfo): string | null {
  switch (status) {
    case "building":
      return "Building the atomic batch...";
    case "awaiting-signature":
      return info.mode === "per-transaction"
        ? "Check your wallet: expect THREE signing prompts - one for each inner transaction, then one for the outer batch. " +
            "The batch is submitted only after all three, so an approval can never be left stranded on-chain."
        : "Check your wallet: ONE approval prompt (single-prompt path - not community-validated).";
    case "submitted":
      return "Batch submitted - waiting for the mirror node...";
    case "confirmed":
      return "Batch confirmed.";
    default:
      return null; // idle / failed: error.message carries the detail
  }
}

export function useHederaBatch(
  connector: WalletBatchConnector | null,
  signerAccountId: string | null,
  mirror: string,
  options: UseHederaBatchOptions = {}
): UseHederaBatch {
  const signingPath: SigningPath = options.signingPath ?? "per-transaction";
  const signingInfo = SIGNING_PATHS[signingPath];
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
    async (built: BuiltUserBatch, batchId: string): Promise<BatchExecutionResult | null> => {
      if (!connector || !signerAccountId) {
        setError({ code: "UNKNOWN", message: "Wallet not connected." });
        setStatus("failed");
        return null;
      }
      if (activeRef.current) return null;
      activeRef.current = true;
      setError(null);
      setResult(null);
      try {
        if (signingPath === "per-transaction") {
          // COMMUNITY-VALIDATED path (guide changelog (C6)):
          // 1) Ask the wallet to SIGN the frozen outer batch via
          //    hedera_signTransaction. The wallet signs EACH inner transaction
          //    and then the outer batch SEPARATELY - expect THREE HashPack
          //    prompts for the standard 2-inner approve+call batch (validated
          //    on mainnet with hedera-wallet-connect 1.5.1 + HashPack >= 14.4.0).
          setStatus("awaiting-signature");
          const response = await connector.signTransaction({
            transactionList: built.transactionListBase64,
            signerAccountId,
          });
          // 2) Consistency guard against the version-dependent body-rebuild
          //    behavior (issue #694 class): decoded bytes must carry the same
          //    transaction id we sent. Throws before anything is relayed.
          const signedBytes = signedBytesFromResponse(response);
          verifySignedBytes(built.batch, signedBytes);
          // 3) Relay the SIGNED bytes via hedera_executeTransaction - the dapp
          //    never signs anything itself and never touches key material.
          setStatus("submitted");
          await connector.executeTransaction({
            transactionList: Buffer.from(signedBytes).toString("base64"),
            signerAccountId,
          });
        } else {
          // SINGLE-PROMPT path - UNVALIDATED (kept as an option; see signingInfo).
          // hedera_signAndExecuteTransaction: the wallet signs and submits its
          // own consistent bytes in ONE prompt.
          setStatus("awaiting-signature");
          await connector.signAndExecuteTransaction({
            transactionList: built.transactionListBase64,
            signerAccountId,
          });
          setStatus("submitted");
        }

        // Watch the mirror node for the ATOMICBATCH parent + inners.
        const outcome = await pollBatchOnMirror(mirror, batchId);

        // Final state.
        if (outcome.parentStatus === "SUCCESS") {
          setStatus("confirmed");
        } else {
          setStatus("failed");
          setError(userMessageFor(new Error(outcome.parentStatus)));
        }
        setResult(outcome);
        return outcome;
      } catch (err) {
        setStatus("failed");
        setError(userMessageFor(err));
        return null;
      } finally {
        activeRef.current = false;
      }
    },
    [connector, signerAccountId, mirror, signingPath]
  );

  return {
    status,
    error,
    result,
    signingPath,
    signingInfo,
    statusMessage: statusMessageFor(status, signingInfo),
    setBuilding,
    executeBatch,
    reset,
  };
}
