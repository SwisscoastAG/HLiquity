// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// config.js - HLiquity mainnet contract/token registry, approval pairs (guide §2.1/§5),
// gas table (see repository README) and the shared long-zero EVM address helper.
// Security: this file holds only public on-chain identifiers. Keys live in .env only.

"use strict";

// ---------------------------------------------------------------------------
// Mainnet only. The address registry below is a mainnet deployment; offering a
// testnet switch with the same IDs creates a false and untestable configuration.
// Mirror-node and JSON-RPC URLs are used only for read-only preflight and
// verification. All writes go through the Hedera SDK client.
// ---------------------------------------------------------------------------
const NETWORKS = Object.freeze({
  mainnet: Object.freeze({
    sdk: "mainnet",
    mirror: "https://mainnet.mirrornode.hedera.com",
    jsonRpcRelay: "https://mainnet.hashio.io/api",
  }),
});

// ---------------------------------------------------------------------------
// guide §5 - MAINNET CONTRACT SET (verified on-chain 2026-10-05 by
// fingerprinting). Repo-committed configs are STALE - trust these IDs only.
// ---------------------------------------------------------------------------
const CONTRACTS = Object.freeze({
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
  hchfTokenWrapper: "0.0.6070122", // spender for HCHF approvals (guide §2.1)
  hchfToken: "0.0.6070123",
  hlqtTokenWrapper: "0.0.6070127", // spender for HLQT approvals (guide §2.1)
  hlqtToken: "0.0.6070128",
  saucerSwapPool: "0.0.6070133", // spender for LP approvals (guide §2.1)
  gasPool: "0.0.6070136",
  multiTroveGetter: "0.0.6070138",
  pythCaller: "0.0.6070144",
  supraCaller: "0.0.6070147",
  lpToken: "0.0.6070469", // SaucerSwap pair / uniToken (no long-zero EVM address needed)
});

// ---------------------------------------------------------------------------
// guide §5/5 - HTS token IDs. HCHF, HLQT and LP all have 8 decimals
// ("Solidity 0.6.11, 8 decimals everywhere"): multiply human amounts by 1e8.
// ---------------------------------------------------------------------------
const TOKENS = Object.freeze({
  hchf: "0.0.6070123",
  hlqt: "0.0.6070128",
  lp: "0.0.6070469",
});

const DECIMALS = 8; // HCHF / HLQT / LP (guide §5). HBAR = tinybar, also 1e8.

// ---------------------------------------------------------------------------
// guide changelog (C2, SAFETY-CRITICAL): HCHF_GAS_COMPENSATION = 20 HCHF
// per trove, covered by the GasPool. BorrowerOperations.closeTrove burns
// debt - 20 from the USER and 20 from GasPool, so a closeTrove approval must
// be exactly NET DEBT = debt - 20 HCHF. Approving the full debt leaves a
// 20 HCHF stealable allowance on the wrapper (the CWE-862 surface).
// ---------------------------------------------------------------------------
const GAS_COMPENSATION_HCHF = 20;
const GAS_COMPENSATION_UNITS = BigInt(GAS_COMPENSATION_HCHF) * 10n ** BigInt(DECIMALS); // 2_000_000_000 raw
const MIN_NET_DEBT_HCHF = 1780;
const MIN_NET_DEBT_UNITS = BigInt(MIN_NET_DEBT_HCHF) * 10n ** BigInt(DECIMALS);

// ---------------------------------------------------------------------------
// guide §2.1 - THE THREE CRITICAL APPROVALS. All HTS pulls are
// executed BY the wrapper/pool contracts (precompile 0x167), so users grant
// allowances to the WRAPPER, not to BorrowerOperations. This is the vulnerable
// surface (ungated inherited transferFrom, selector 0x15dacbea, CWE-862) -
// the race window this CLI closes by batching approve + call atomically.
// ---------------------------------------------------------------------------
const APPROVALS = Object.freeze({
  // #1 consumed by: provideToSP, repayHCHF, closeTrove, adjustTrove (repay side), redeemCollateral
  hchfToWrapper: Object.freeze({
    token: TOKENS.hchf,
    spender: CONTRACTS.hchfTokenWrapper,
    label: "HCHF -> HCHFToken wrapper",
  }),
  // #2 consumed by: HLQTStaking.stake
  hlqtToWrapper: Object.freeze({
    token: TOKENS.hlqt,
    spender: CONTRACTS.hlqtTokenWrapper,
    label: "HLQT -> HLQTToken wrapper",
  }),
  // #3 consumed by: SaucerSwapPool.stake
  lpToPool: Object.freeze({
    token: TOKENS.lp,
    spender: CONTRACTS.saucerSwapPool,
    label: "LP -> SaucerSwapPool",
  }),
});

// ---------------------------------------------------------------------------
// guide changelog (C7) - GAS TABLE. These are TEST DEFAULTS
// from community mainnet pilots, NOT production guarantees - calibrate
// per flow before production use.
// ---------------------------------------------------------------------------
const GAS = Object.freeze({
  redeem: 3_000_000, // TroveManager.redeemCollateral
  troveOps: 1_500_000, // open/adjust/close family (+ addColl / withdrawColl / withdrawHCHF / repayHCHF)
  stabilityPool: 800_000, // provideToSP / withdrawFromSP
  stakingLp: 500_000, // HLQT stake/unstake, LP stake/withdraw/claimReward
  liquidate: 3_000_000, // TroveManager.liquidate* (heavy; not in the guide table - same calibration rule)
  readQuery: 300_000, // simple ContractCallQuery reads (for example, current trove debt)
});

// ---------------------------------------------------------------------------
// Long-zero EVM address conversion, implemented manually per spec (do NOT rely
// on SDK internals): 16 zero bytes + 4-byte big-endian account number.
// Example: evm("0.0.6070094") === "0x0000000000000000000000000000000000005c9f4e"
// (matches the guide §5 EVM column).
// ---------------------------------------------------------------------------
function evm(hederaId) {
  const parts = String(hederaId).split(".");
  if (parts.length !== 3) {
    throw new Error(`evm(): not a Hedera account/contract id: ${hederaId}`);
  }
  const num = BigInt(parts[2]); // account number
  if (num < 0n || num > 0xffffffffn) {
    throw new Error(`evm(): account number out of uint32 range: ${hederaId}`);
  }
  const hex = num.toString(16).padStart(8, "0"); // 4-byte big-endian
  return "0x" + "0".repeat(32) + hex; // 16 zero bytes (32 hex chars) + 4 bytes
}

// EVM zero address. SortedTroves accepts it as a slower scan fallback for
// BorrowerOperations flows. Partial redemptions use freshly computed upper and
// lower insertion hints; zero is used there only when partial NICR is zero.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Amount parsing. Human token/HBAR amounts (e.g. "1500" HCHF, "12.5" HBAR)
// -> base units with 8 decimals (multiply by 1e8). Raw uints (maxFee 1e8,
// NICR, maxIterations) use parseUint and are passed through untouched.
// ---------------------------------------------------------------------------
function tokenUnits(human, decimals = DECIMALS) {
  const s = String(human).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`tokenUnits(): not a non-negative decimal amount: ${human}`);
  }
  const [intPart, fracPart = ""] = s.split(".");
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac === "" ? "0" : frac);
}

// Parse a raw unsigned integer string such as "100000000", with a
// convenience "NeM" exponent form ("1e8" -> 10^8) for --max-fee.
// NOTE (guide changelog (C3)): maxFeePercentage is 8-DECIMAL
// (BaseMath.DECIMAL_PRECISION = 1e8): 100% = 1e8, 0.5% floor = 500000.
function parseUint(raw) {
  const s = String(raw).trim();
  const m = /^(\d+)(?:e(\d+))?$/i.exec(s);
  if (!m) {
    throw new Error(`parseUint(): not a non-negative integer (optional NeM form): ${raw}`);
  }
  const base = BigInt(m[1]);
  return m[2] ? base * 10n ** BigInt(m[2]) : base;
}

module.exports = {
  NETWORKS,
  CONTRACTS,
  TOKENS,
  DECIMALS,
  GAS_COMPENSATION_HCHF,
  GAS_COMPENSATION_UNITS,
  MIN_NET_DEBT_HCHF,
  MIN_NET_DEBT_UNITS,
  APPROVALS,
  GAS,
  ZERO_ADDRESS,
  evm,
  tokenUnits,
  parseUint,
};
