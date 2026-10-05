// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// hliquityBatches.ts - typed builders for the 7 BATCHED flows of guide §6.3:
//   redeemCollateral, provideToSP, repayHCHF, closeTrove, adjustTrove (repay/add-coll),
//   stake (HLQT), stake (LP) - plus the associateTokens() helper (native inner BEFORE approve).
// Every batched flow shapes the batch as [AccountAllowanceApproveTransaction EXACT amount FIRST,
// ContractExecuteTransaction LAST] per the HIP-551 one-contract-op-last rule (guide §4).
// Contract IDs / signatures: guide §5. Amounts: human -> 8 decimals (x1e8).
// HINT READS use ethers 5.7.2 callStatic against a JSON-RPC relay (documented in readRedemptionHints).

import {
  AccountAllowanceApproveTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  TokenAssociateTransaction,
  type AccountId,
  type Transaction,
} from "@hashgraph/sdk";
import { ethers } from "ethers"; // v5.7.2 - already a dependency of the blokk fork
import {
  APPROVALS,
  CONTRACTS,
  GAS,
  GAS_COMPENSATION_HCHF,
  GAS_COMPENSATION_UNITS,
  TOKENS,
  ZERO_ADDRESS,
  evm,
  tokenUnits,
  type ApprovalPair,
} from "./config";
import { prepareInnerTransaction, type UserBatchContext } from "./batchTxBuilder";

/**
 * ContractFunctionParameters.addUint256 in the 2.x SDK line accepts
 * string | number | BigNumber at RUNTIME - but NOT BigInt (runtime throws
 * "must be a String, Number, or BigNumber"), and the shipped .d.ts declares
 * only number | Long | BigNumber. Our amounts are BigInt, so every uint256
 * argument passes through U() and becomes a decimal string.
 */
type Uint256Arg = Parameters<ContractFunctionParameters["addUint256"]>[0];
function U(value: bigint | number): Uint256Arg {
  return (typeof value === "bigint" ? value.toString() : value) as Uint256Arg;
}

/** Exact-amount approval inner per guide §2.1 (post-batch residue allowance = 0). */
function exactApproveInner(
  pair: ApprovalPair,
  ownerId: AccountId,
  amount: bigint
): AccountAllowanceApproveTransaction {
  return new AccountAllowanceApproveTransaction().approveTokenAllowance(
    pair.token,
    ownerId,
    pair.spender,
    amount
  );
}

function contractExecInner(
  contractId: string,
  gas: number,
  fn: string,
  params: ContractFunctionParameters,
  payableTinybar?: bigint
): ContractExecuteTransaction {
  const tx = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(gas)
    .setFunction(fn, params);
  if (payableTinybar && payableTinybar > 0n) {
    // Hbar.fromTinybars takes string|number|BigNumber (not BigInt) - decimal string it.
    tx.setPayableAmount(Hbar.fromTinybars(payableTinybar.toString()));
  }
  return tx;
}

export interface PreparedInner {
  tx: Transaction;
  description: string;
}

/**
 * guide §6.3 "First-time token use": a TokenAssociateTransaction as a
 * NATIVE inner, placed BEFORE the approval. Association is not a contract op, so
 * it does not count against the one-contract-op-last rule.
 */
export async function associateTokens(
  tokenIds: string[],
  ctx: UserBatchContext
): Promise<PreparedInner[]> {
  const associate = new TokenAssociateTransaction()
    .setAccountId(ctx.userAccountId)
    .setTokenIds(tokenIds);
  const prepared = await prepareInnerTransaction(associate, ctx, `Associate tokens: ${tokenIds.join(", ")}`);
  return [prepared];
}

// ---------------------------------------------------------------------------
// Redemption hints. CHOICE OF READ PATH: the frontend has no operator client,
// and a ContractCallQuery through the SDK would need one. The blokk fork already
// ships ethers 5.7.2 and a JSON-RPC relay endpoint works for plain eth_call, so
// reads go through ethers' StaticJsonRpcProvider.callStatic against the long-zero
// EVM addresses of the view contracts. No signing involved - read-only.
// ---------------------------------------------------------------------------

const HINT_HELPERS_ABI = [
  "function getRedemptionHints(uint256 _HCHFamount, uint256 _price, uint256 _maxIterations) view returns (address firstRedemptionHint, uint256 partialRedemptionHintNICR, uint256 truncatedHCHFamount, uint256 lastTroveRedeemed)",
];
const PRICE_FEED_ABI = ["function lastGoodPrice() view returns (uint256)"];

export interface RedemptionHints {
  price: bigint;
  firstRedemptionHint: string;
  upperPartialRedemptionHint: string;
  lowerPartialRedemptionHint: string;
  partialRedemptionHintNICR: bigint;
  /**
   * 3rd return value of HintHelpers.getRedemptionHints (guide changelog,
   * C4): the amount actually redeemable within _maxIterations. redeemCollateral
   * may consume LESS than requested - approve/call amounts must be derived from
   * this, never from the requested amount.
   */
  truncatedHCHFAmount: bigint;
}

export async function readRedemptionHints(
  hchfAmount: bigint,
  maxIterations: number,
  relayUrl: string
): Promise<RedemptionHints> {
  const provider = new ethers.providers.StaticJsonRpcProvider(relayUrl);
  const priceFeed = new ethers.Contract(evm(CONTRACTS.priceFeed), PRICE_FEED_ABI, provider);
  const price: ethers.BigNumber = await priceFeed.callStatic.lastGoodPrice();

  const hintHelpers = new ethers.Contract(evm(CONTRACTS.hintHelpers), HINT_HELPERS_ABI, provider);
  const [firstRedemptionHint, partialRedemptionHintNICR, truncatedHCHFAmount]: [
    string,
    ethers.BigNumber,
    ethers.BigNumber,
  ] = await hintHelpers.callStatic.getRedemptionHints(hchfAmount, price, maxIterations);

  return {
    price: price.toBigInt(),
    firstRedemptionHint,
    // Zero partial hints are a FALLBACK that works at higher gas (the guide
    // guide changelog (C7): test defaults, not production guarantees); a production
    // frontend computes them via SortedTroves.findInsertPosition.
    upperPartialRedemptionHint: ZERO_ADDRESS,
    lowerPartialRedemptionHint: ZERO_ADDRESS,
    partialRedemptionHintNICR: partialRedemptionHintNICR.toBigInt(),
    truncatedHCHFAmount: truncatedHCHFAmount.toBigInt(),
  };
}

export interface FlowBaseArgs {
  ctx: UserBatchContext;
}

export interface AmountArgs extends FlowBaseArgs {
  /** Human amount, e.g. "1500" -> 1_500_0000_0000 base units (8 decimals). */
  humanAmount: string;
}

/** Human-readable HCHF string for UI messages (8 decimals). */
function hchf(baseUnits: bigint): string {
  const whole = baseUnits / 10n ** 8n;
  const frac = baseUnits % 10n ** 8n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

/**
 * redeemCollateral on TroveManager 0.0.6070118 - THE incident flow.
 *
 * REDEMPTION TRUNCATION (guide changelog (C4)): the hints read exposes
 * truncatedHCHFAmount - what is actually redeemable within maxIterations. If
 * truncated < requested this builder THROWS by default (caller re-runs with a
 * higher maxIterations); pass allowTruncated to approve AND call with the
 * truncated amount instead. NEVER approve more than the call consumes.
 *
 * Honesty (C4): stale hints or on-chain state changes between the read and
 * the batch can still make the call consume less than truncated - there is NO
 * absolute zero-residue guarantee for large redemptions on the immutable
 * contracts. Check the allowance residue after confirmation and keep
 * redemptions small.
 */
export async function buildRedeemCollateral(args: {
  ctx: UserBatchContext;
  humanAmount: string;
  /** 8-decimal maxFeePercentage (C3): 100% = 1e8, 0.5% floor = 500000. */
  maxFeePercentage?: bigint; // default 1e8 = 100%
  maxIterations?: number; // default 10
  /** Approve+call the truncated amount instead of throwing (see C4 above). */
  allowTruncated?: boolean;
  relayUrl: string;
}): Promise<PreparedInner[]> {
  const requested = tokenUnits(args.humanAmount);
  const maxFee = args.maxFeePercentage ?? 10n ** 8n; // 8-decimal per C3 - NOT 1e18
  const maxIterations = args.maxIterations ?? 10;
  const hints = await readRedemptionHints(requested, maxIterations, args.relayUrl);

  let effective = requested;
  if (hints.truncatedHCHFAmount < requested) {
    if (!args.allowTruncated) {
      throw new Error(
        `redemption would be truncated: only ${hchf(hints.truncatedHCHFAmount)} of ${hchf(requested)} HCHF ` +
          `redeemable with maxIterations=${maxIterations} - re-run with a higher maxIterations or allowTruncated`
      );
    }
    effective = hints.truncatedHCHFAmount; // approve exactly what the call will consume
  }

  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, effective);
  const exec = contractExecInner(
    CONTRACTS.troveManager,
    GAS.redeem,
    "redeemCollateral",
    new ContractFunctionParameters()
      .addUint256(U(effective))
      .addAddress(hints.firstRedemptionHint)
      .addAddress(hints.upperPartialRedemptionHint)
      .addAddress(hints.lowerPartialRedemptionHint)
      .addUint256(U(hints.partialRedemptionHintNICR))
      .addUint256(U(maxIterations))
      .addUint256(U(maxFee))
  );

  const effectiveHuman = hchf(effective);
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${effectiveHuman} HCHF for HCHFToken wrapper (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, `Redeem ${effectiveHuman} HCHF for collateral`),
  ];
}

/** provideToSP(uint _amount, address _frontEndTag) on StabilityPool 0.0.6070108. */
export async function buildProvideToSP(args: AmountArgs): Promise<PreparedInner[]> {
  const amount = tokenUnits(args.humanAmount);
  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.stabilityPool,
    GAS.stabilityPool,
    "provideToSP",
    new ContractFunctionParameters().addUint256(U(amount)).addAddress(ZERO_ADDRESS) // no frontend tag
  );
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${args.humanAmount} HCHF for HCHFToken wrapper (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, `Provide ${args.humanAmount} HCHF to Stability Pool`),
  ];
}

/** repayHCHF(uint _amount, address _upperHint, address _lowerHint) on BorrowerOperations 0.0.6070094. */
export async function buildRepayHCHF(args: AmountArgs): Promise<PreparedInner[]> {
  const amount = tokenUnits(args.humanAmount);
  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "repayHCHF",
    new ContractFunctionParameters()
      .addUint256(U(amount))
      .addAddress(ZERO_ADDRESS)
      .addAddress(ZERO_ADDRESS)
  );
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${args.humanAmount} HCHF for HCHFToken wrapper (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, `Repay ${args.humanAmount} HCHF to trove`),
  ];
}

/**
 * closeTrove() on BorrowerOperations.
 * *** SAFETY-CRITICAL (guide changelog (C2)) ***
 * BorrowerOperations.closeTrove burns DEBT - 20 HCHF from the USER and the
 * 20 HCHF gas compensation from GasPool. Approve exactly NET DEBT = debt - 20:
 * approving the full debt would leave a 20 HCHF residue allowance on the
 * HCHFToken wrapper, stealable via the ungated transferFrom (CWE-862) that
 * caused this incident. humanAmount = FULL trove debt (must be > 20 HCHF).
 */
export async function buildCloseTrove(args: AmountArgs): Promise<PreparedInner[]> {
  const fullDebt = tokenUnits(args.humanAmount);
  if (fullDebt <= GAS_COMPENSATION_UNITS) {
    throw new Error(
      `closeTrove humanAmount must be the FULL debt (> ${GAS_COMPENSATION_HCHF} HCHF); got ${args.humanAmount} HCHF`
    );
  }
  const netDebt = fullDebt - GAS_COMPENSATION_UNITS; // what closeTrove burns from the user
  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, netDebt);
  const exec = contractExecInner(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "closeTrove",
    new ContractFunctionParameters()
  );
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${hchf(netDebt)} HCHF (net debt = full debt - ${GAS_COMPENSATION_HCHF}) for HCHFToken wrapper (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, "Close trove"),
  ];
}

/**
 * adjustTrove(uint _maxFee, uint _collWithdrawal, uint _debtChange, bool
 * isDebtIncrease, address _upperHint, address _lowerHint) payable. Reference
 * builder covers the batch-relevant shapes: repay debt (--amount, exact HCHF
 * approval inner) and/or add collateral (humanCollHbar, payable). The
 * isDebtIncrease=true / withdraw-collateral shapes involve no allowance and are
 * plain single ContractExecute calls outside this helper.
 */
export async function buildAdjustTrove(args: {
  ctx: UserBatchContext;
  humanRepayAmount?: string; // HCHF to repay -> exact approval inner
  humanCollHbar?: string; // HBAR to add -> payable
  /** 8-decimal maxFeePercentage (C3): 100% = 1e8, 0.5% floor = 500000. */
  maxFeePercentage?: bigint;
}): Promise<PreparedInner[]> {
  const repayAmount = args.humanRepayAmount ? tokenUnits(args.humanRepayAmount) : 0n;
  const payableTinybar = args.humanCollHbar ? tokenUnits(args.humanCollHbar) : undefined;
  const maxFee = args.maxFeePercentage ?? 10n ** 8n; // 8-decimal per C3 - NOT 1e18

  const exec = contractExecInner(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "adjustTrove",
    new ContractFunctionParameters()
      .addUint256(U(maxFee))
      .addUint256(U(0n)) // _collWithdrawal
      .addUint256(U(repayAmount))
      .addBool(false) // isDebtIncrease = false (repay side, allowance #1)
      .addAddress(ZERO_ADDRESS)
      .addAddress(ZERO_ADDRESS),
    payableTinybar
  );

  const prepared: PreparedInner[] = [];
  if (repayAmount > 0n) {
    // Repay path verified per guide changelog (C2): approval = exact
    // repay amount = _debtChange consumed by the call (no gas-compensation
    // offset applies to partial repays - the 20 HCHF offset is closeTrove-only).
    const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, repayAmount);
    prepared.push(
      await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${args.humanRepayAmount} HCHF for HCHFToken wrapper (batch-locked)`)
    );
  }
  prepared.push(await prepareInnerTransaction(exec, args.ctx, "Adjust trove"));
  return prepared;
}

/** stake(uint) on HLQTStaking 0.0.6070064 - approval #2 (HLQT -> HLQTToken wrapper). */
export async function buildStakeHLQT(args: AmountArgs): Promise<PreparedInner[]> {
  const amount = tokenUnits(args.humanAmount);
  const approve = exactApproveInner(APPROVALS.hlqtToWrapper, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.hlqtStaking,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(amount))
  );
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${args.humanAmount} HLQT for HLQTToken wrapper (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, `Stake ${args.humanAmount} HLQT`),
  ];
}

/** stake(uint256) on SaucerSwapPool 0.0.6070133 - approval #3 (LP -> SaucerSwapPool). */
export async function buildStakeLP(args: AmountArgs): Promise<PreparedInner[]> {
  const amount = tokenUnits(args.humanAmount);
  const approve = exactApproveInner(APPROVALS.lpToPool, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.saucerSwapPool,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(amount))
  );
  return [
    await prepareInnerTransaction(approve, args.ctx, `Approve EXACT ${args.humanAmount} LP for SaucerSwapPool (batch-locked)`),
    await prepareInnerTransaction(exec, args.ctx, `Stake ${args.humanAmount} LP`),
  ];
}

/** re-export so call sites can build the association inner from a token choice */
export { TOKENS };
