// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// config.ts - typed mirror of cli/config.js: HLiquity mainnet registry (guide §5),
// approval pairs (guide §2.1), gas table (see repository README). The evm() helper is intentionally
// duplicated here (HARD RULE: no cross-folder imports between reference artifacts).
// Security: public on-chain identifiers only - never put key material in source.

export type HederaId = `0.0.${number}`;

export interface NetworkConfig {
  name: "mainnet";
  mirror: string;
  /** Hedera JSON-RPC relay endpoint used for read-only eth_call hint queries. */
  jsonRpcRelay: string;
}

export const NETWORKS: Record<"mainnet", NetworkConfig> = {
  mainnet: {
    name: "mainnet",
    mirror: "https://mainnet.mirrornode.hedera.com",
    jsonRpcRelay: "https://mainnet.hashio.io/api",
  },
};

/** guide §5 - MAINNET CONTRACT SET (verified on-chain 2026-10-05). Repo-committed configs are STALE. */
export const CONTRACTS = {
  activePool: "0.0.6070027",
  collSurplusPool: "0.0.6070030",
  communityIssuance: "0.0.6070036",
  defaultPool: "0.0.6070041",
  hintHelpers: "0.0.6070047",
  lockupContractFactory: "0.0.6070057",
  hlqtStaking: "0.0.6070064",
  priceFeed: "0.0.6070082",
  sortedTroves: "0.0.6070089",
  borrowerOperations: "0.0.6070094",
  stabilityPool: "0.0.6070108",
  troveManager: "0.0.6070118",
  hchfTokenWrapper: "0.0.6070122",
  hchfToken: "0.0.6070123",
  hlqtTokenWrapper: "0.0.6070127",
  hlqtToken: "0.0.6070128",
  saucerSwapPool: "0.0.6070133",
  gasPool: "0.0.6070136",
  multiTroveGetter: "0.0.6070138",
  pythCaller: "0.0.6070144",
  supraCaller: "0.0.6070147",
  lpToken: "0.0.6070469",
} as const;

/** guide §5/5 - HTS token IDs (8 decimals everywhere). */
export const TOKENS = {
  hchf: "0.0.6070123",
  hlqt: "0.0.6070128",
  lp: "0.0.6070469",
} as const;

export const DECIMALS = 8; // HCHF / HLQT / LP; HBAR -> tinybar also 1e8

/**
 * guide changelog (C2, SAFETY-CRITICAL): HCHF_GAS_COMPENSATION = 20 HCHF
 * per trove, covered by the GasPool. BorrowerOperations.closeTrove burns
 * debt - 20 from the USER and 20 from GasPool, so a closeTrove approval must
 * be exactly NET DEBT = debt - 20 HCHF. Approving the full debt leaves a
 * 20 HCHF stealable allowance on the wrapper (the CWE-862 incident surface).
 */
export const GAS_COMPENSATION_HCHF = 20;
/** 20 HCHF in 8-decimal raw units (2_000_000_000). */
export const GAS_COMPENSATION_UNITS = BigInt(GAS_COMPENSATION_HCHF) * 10n ** BigInt(DECIMALS);

/** LiquityBase.MIN_NET_DEBT. Safe redemption exits are split at this boundary. */
export const MIN_NET_DEBT_HCHF = 1780;
export const MIN_NET_DEBT_UNITS = BigInt(MIN_NET_DEBT_HCHF) * 10n ** BigInt(DECIMALS);

export interface ApprovalPair {
  token: HederaId;
  spender: HederaId;
  label: string;
}

/**
 * guide §2.1 - THE THREE CRITICAL APPROVALS (the vulnerable surface:
 * ungated inherited transferFrom, CWE-862). Approve EXACT amounts so the
 * post-batch residue allowance is 0.
 */
export const APPROVALS = {
  /** #1 - consumed by provideToSP, repayHCHF, closeTrove, adjustTrove(repay), redeemCollateral */
  hchfToWrapper: {
    token: TOKENS.hchf,
    spender: CONTRACTS.hchfTokenWrapper,
    label: "HCHF -> HCHFToken wrapper",
  },
  /** #2 - consumed by HLQTStaking.stake */
  hlqtToWrapper: {
    token: TOKENS.hlqt,
    spender: CONTRACTS.hlqtTokenWrapper,
    label: "HLQT -> HLQTToken wrapper",
  },
  /** #3 - consumed by SaucerSwapPool.stake */
  lpToPool: {
    token: TOKENS.lp,
    spender: CONTRACTS.saucerSwapPool,
    label: "LP -> SaucerSwapPool",
  },
} as const satisfies Record<string, ApprovalPair>;

/**
 * guide changelog (C7) - GAS TABLE. TEST DEFAULTS from
 * community mainnet pilots, NOT production guarantees - calibrate per
 * flow before production use. Partial-redemption hints must come from the
 * existing populated-redemption path; do not substitute zero addresses.
 */
export const GAS = {
  redeem: 3_000_000,
  troveOps: 1_500_000, // open/adjust/close family
  stabilityPool: 800_000,
  stakingLp: 500_000,
} as const;

/** Valid no-hint value for flows whose SortedTroves path permits a full scan. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Long-zero EVM address conversion, implemented manually per spec (do NOT rely
 * on SDK internals): 16 zero bytes + 4-byte big-endian account number.
 * evm("0.0.6070094") === "0x0000000000000000000000000000000000005c9f4e"
 */
export function evm(hederaId: string): `0x${string}` {
  const parts = hederaId.split(".");
  if (parts.length !== 3) throw new Error(`evm(): not a Hedera id: ${hederaId}`);
  const num = BigInt(parts[2]);
  if (num < 0n || num > 0xffffffffn) throw new Error(`evm(): account number out of uint32 range: ${hederaId}`);
  const hex = num.toString(16).padStart(8, "0");
  return `0x${"0".repeat(32)}${hex}`;
}

/** Human amount (e.g. "12.5") -> 8-decimal base units (multiply by 1e8). */
export function tokenUnits(human: string, decimals: number = DECIMALS): bigint {
  const s = human.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`tokenUnits(): invalid amount: ${human}`);
  const [intPart, fracPart = ""] = s.split(".");
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac === "" ? "0" : frac);
}
