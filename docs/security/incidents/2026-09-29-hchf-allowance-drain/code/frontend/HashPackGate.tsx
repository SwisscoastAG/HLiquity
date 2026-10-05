// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// HashPackGate.tsx - renders children only when the connected wallet supports HIP-551
// batches. HashPack >= 14.4.0 (2026-07-17) added batch support over WalletConnect;
// HashPack 14.3.0 removed the legacy HashConnect v2 protocol (guide §6.1).
// hashconnect itself is DEPRECATED - never build on it.
//
// VERSION DETECTION NOTE (UNVERIFIED): whether the WalletConnect session exposes the
// HashPack extension version is not guaranteed. If `version` is unavailable the gate
// falls back to the caution panel and asks the user to confirm they are on >= 14.4.0.
// Best-effort detection - re-verify on every supported connector/wallet release.

import { useMemo, type ReactNode } from "react";

export interface WalletInfo {
  /** Wallet name from the WalletConnect session peer metadata (e.g. "HashPack"). */
  name?: string;
  /** Extension version if detectable; null/undefined means "could not determine". */
  version?: string | null;
}

export type HashPackSupport =
  | "checking" // no wallet connected yet / still resolving
  | "supported"
  | "outdated" // connected HashPack below 14.4.0
  | "unknown" // HashPack connected but version not detectable
  | "not-hashpack"; // a different wallet - the guide only verifies HashPack >= 14.4.0

const MIN_HASHPACK_VERSION = [14, 4, 0] as const;

export function compareVersions(a: string, b: readonly number[]): number {
  const parts = a.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < b.length; i += 1) {
    const left = parts[i] ?? 0;
    if (left > b[i]) return 1;
    if (left < b[i]) return -1;
  }
  return 0;
}

export function assessHashPackSupport(wallet: WalletInfo | null): HashPackSupport {
  if (!wallet || !wallet.name) return "checking";
  const isHashPack = /hashpack/i.test(wallet.name);
  if (!isHashPack) return "not-hashpack";
  if (!wallet.version) return "unknown";
  return compareVersions(wallet.version, MIN_HASHPACK_VERSION) >= 0 ? "supported" : "outdated";
}

export interface HashPackGateProps {
  wallet: WalletInfo | null;
  children: ReactNode;
}

export function HashPackGate({ wallet, children }: HashPackGateProps) {
  const support = useMemo(() => assessHashPackSupport(wallet), [wallet]);

  if (support === "supported") {
    return <>{children}</>;
  }

  const title =
    support === "outdated"
      ? "Your HashPack version does not support atomic batch transactions"
      : support === "unknown"
        ? "Confirm your HashPack version to use atomic batches"
        : support === "not-hashpack"
          ? "This emergency flow has only been validated with HashPack"
          : "Connect a wallet";

  return (
    <div role="alert" style={{ border: "1px solid #b45309", borderRadius: 8, padding: 16, maxWidth: 560 }}>
      <strong>{title}</strong>
      <p style={{ margin: "8px 0" }}>
        Atomic batches (approve + operation in one approval) require HashPack <code>14.4.0</code> or newer.
        Batching is what protects you from the allowance-sweep attack: without it, an approval sits
        exposed for a few seconds before the follow-up transaction lands.
      </p>
      {support === "outdated" && (
        <p style={{ margin: "8px 0" }}>
          Please update HashPack: <a href="https://www.hashpack.app/" target="_blank" rel="noreferrer">hashpack.app</a>, then reconnect.
        </p>
      )}
      {support === "unknown" && (
        <p style={{ margin: "8px 0" }}>
          We could not detect your HashPack version automatically. Check the extension details and make sure it is at least 14.4.0 before continuing.
        </p>
      )}
      {support !== "checking" && (
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          This gate fails closed. There is no non-atomic approval fallback because that would recreate
          the exact allowance-sweep window this emergency flow is intended to remove.
        </p>
      )}
    </div>
  );
}
