// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// hliquityBatches.ts - typed builders for the 7 BATCHED flows of guide §6.3:
//   redeemCollateral, provideToSP, repayHCHF, closeTrove, adjustTrove (repay/add-coll),
//   stake (HLQT), stake (LP).
// Every batched flow shapes the batch as [AccountAllowanceApproveTransaction EXACT amount FIRST,
// ContractExecuteTransaction LAST] per the HIP-551 one-contract-op-last rule (guide §4).
// Contract IDs / signatures: guide §5. Amounts: human -> 8 decimals (x1e8).
// HINT READS use ethers 5.7.2 callStatic against a JSON-RPC relay (documented in readRedemptionHints).

import {
  AccountAllowanceApproveTransaction,
  ContractId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  Long,
  type AccountId,
} from "@hashgraph/sdk";
import { ethers } from "ethers"; // v5.7.2 - already a dependency of the blokk fork
import {
  APPROVALS,
  CONTRACTS,
  GAS,
  GAS_COMPENSATION_HCHF,
  GAS_COMPENSATION_UNITS,
  MIN_NET_DEBT_HCHF,
  MIN_NET_DEBT_UNITS,
  ZERO_ADDRESS,
  evm,
  tokenUnits,
  type ApprovalPair,
} from "./config";
import {
  prepareInnerTransaction,
  type PreparedAllowanceFlow,
  type UserBatchContext,
} from "./batchTxBuilder";

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
    Long.fromString(amount.toString(), true, 10)
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

function allowanceExpectation(
  pair: ApprovalPair,
  ownerId: AccountId,
  amount: bigint
): PreparedAllowanceFlow["allowanceExpectation"] {
  return {
    ownerAccountId: ownerId.toString(),
    tokenId: pair.token,
    spenderAccountId: pair.spender,
    expectedDebitUnits: amount.toString(),
  };
}

async function prepareAllowanceFlow(
  pair: ApprovalPair,
  amount: bigint,
  ctx: UserBatchContext,
  approve: AccountAllowanceApproveTransaction,
  exec: ContractExecuteTransaction,
  approveDescription: string,
  execDescription: string
): Promise<PreparedAllowanceFlow> {
  return {
    inners: [
      await prepareInnerTransaction(approve, ctx, approveDescription),
      await prepareInnerTransaction(exec, ctx, execDescription),
    ],
    allowanceExpectation: allowanceExpectation(pair, ctx.userAccountId, amount),
  };
}

// The successful mainnet test used the existing frontend's populated
// redemption transaction. Keep that established hint/ABI path as the source of
// truth instead of duplicating the ABI here.
export interface PopulatedRedemption {
  attemptedAmount: bigint;
  redeemableAmount: bigint;
  isTruncated: boolean;
  rawPopulatedTransaction: ContractExecuteTransaction;
}

export type PopulateRedemption = (
  requestedAmount: bigint,
  maxIterations: 1
) => Promise<PopulatedRedemption>;

const TROVE_MANAGER_ABI = [
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 debt, uint256 coll, uint256 pendingHCHFDebtReward, uint256 pendingETHReward)",
];

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
 * Safety boundary proven by the 1 HCHF mainnet test: one iteration, no
 * truncation, and an amount <= MIN_NET_DEBT. With that shape, the first trove
 * can only consume the full request or cancel before consuming anything. The
 * latter makes redeemCollateral revert, rolling back the approval. Larger
 * exits must be split into repeated batches no larger than MIN_NET_DEBT.
 */
export async function buildRedeemCollateral(args: {
  ctx: UserBatchContext;
  humanAmount: string;
  populateRedemption: PopulateRedemption;
}): Promise<PreparedAllowanceFlow> {
  const requested = tokenUnits(args.humanAmount);
  if (requested === 0n || requested > MIN_NET_DEBT_UNITS) {
    throw new Error(
      `safe redemption batches must be > 0 and <= ${MIN_NET_DEBT_HCHF} HCHF; split larger exits into chunks`
    );
  }

  const populated = await args.populateRedemption(requested, 1);
  if (
    populated.attemptedAmount !== requested ||
    populated.redeemableAmount !== requested ||
    populated.isTruncated
  ) {
    throw new Error(
      `redemption preflight is not exact: requested ${hchf(requested)} HCHF, redeemable ${hchf(populated.redeemableAmount)} HCHF`
    );
  }

  const exec = populated.rawPopulatedTransaction;
  const expectedTroveManager = ContractId.fromString(CONTRACTS.troveManager).toString();
  if (exec.contractId?.toString() !== expectedTroveManager) {
    throw new Error(
      `redemption targets ${exec.contractId?.toString() ?? "no contract"}, not TroveManager ${expectedTroveManager}`
    );
  }
  exec
    .setMaxTransactionFee(new Hbar(5))
    .setTransactionMemo(`HLiquity atomic redeem ${hchf(requested)} HCHF`);

  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, requested);
  const effectiveHuman = hchf(requested);
  return prepareAllowanceFlow(
    APPROVALS.hchfToWrapper,
    requested,
    args.ctx,
    approve,
    exec,
    `Approve EXACT ${effectiveHuman} HCHF for HCHFToken wrapper (batch-locked)`,
    `Redeem ${effectiveHuman} HCHF for collateral`
  );
}

/** provideToSP(uint _amount, address _frontEndTag) on StabilityPool 0.0.6070108. */
export async function buildProvideToSP(args: AmountArgs): Promise<PreparedAllowanceFlow> {
  const amount = tokenUnits(args.humanAmount);
  if (amount === 0n) throw new Error("Stability Pool deposit must be greater than zero");
  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.stabilityPool,
    GAS.stabilityPool,
    "provideToSP",
    new ContractFunctionParameters().addUint256(U(amount)).addAddress(ZERO_ADDRESS) // no frontend tag
  );
  return prepareAllowanceFlow(
    APPROVALS.hchfToWrapper, amount, args.ctx, approve, exec,
    `Approve EXACT ${args.humanAmount} HCHF for HCHFToken wrapper (batch-locked)`,
    `Provide ${args.humanAmount} HCHF to Stability Pool`
  );
}

/** repayHCHF(uint _amount, address _upperHint, address _lowerHint) on BorrowerOperations 0.0.6070094. */
export async function buildRepayHCHF(args: AmountArgs): Promise<PreparedAllowanceFlow> {
  const amount = tokenUnits(args.humanAmount);
  if (amount === 0n) throw new Error("Repayment must be greater than zero");
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
  return prepareAllowanceFlow(
    APPROVALS.hchfToWrapper, amount, args.ctx, approve, exec,
    `Approve EXACT ${args.humanAmount} HCHF for HCHFToken wrapper (batch-locked)`,
    `Repay ${args.humanAmount} HCHF to trove`
  );
}

/**
 * closeTrove() on BorrowerOperations.
 * *** SAFETY-CRITICAL (guide changelog (C2)) ***
 * BorrowerOperations.closeTrove burns DEBT - 20 HCHF from the USER and the
 * 20 HCHF gas compensation from GasPool. Approve exactly NET DEBT = debt - 20:
 * approving the full debt would leave a 20 HCHF residue allowance on the
 * HCHFToken wrapper, stealable via the ungated transferFrom (CWE-862) that
 * caused this incident. Never accept debt as user-entered text: fetch the
 * current entire debt, including pending redistribution rewards.
 */
export async function buildCloseTrove(args: {
  ctx: UserBatchContext;
  relayUrl: string;
}): Promise<PreparedAllowanceFlow> {
  const provider = new ethers.providers.StaticJsonRpcProvider(args.relayUrl);
  const troveManager = new ethers.Contract(
    evm(CONTRACTS.troveManager),
    TROVE_MANAGER_ABI,
    provider
  );
  const result: [ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber] =
    await troveManager.callStatic.getEntireDebtAndColl(args.ctx.userEvmAddress);
  const fullDebt = result[0].toBigInt();
  if (fullDebt <= GAS_COMPENSATION_UNITS) {
    throw new Error(
      `current entire debt must be > ${GAS_COMPENSATION_HCHF} HCHF; got ${hchf(fullDebt)} HCHF`
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
  return prepareAllowanceFlow(
    APPROVALS.hchfToWrapper, netDebt, args.ctx, approve, exec,
    `Approve EXACT ${hchf(netDebt)} HCHF (net debt = full debt - ${GAS_COMPENSATION_HCHF}) for HCHFToken wrapper (batch-locked)`,
    "Close trove"
  );
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
}): Promise<PreparedAllowanceFlow> {
  const repayAmount = args.humanRepayAmount ? tokenUnits(args.humanRepayAmount) : 0n;
  const payableTinybar = args.humanCollHbar ? tokenUnits(args.humanCollHbar) : undefined;
  const maxFee = args.maxFeePercentage ?? 10n ** 8n; // 8-decimal per C3 - NOT 1e18
  if (repayAmount === 0n) {
    throw new Error("This batch helper only supports adjustTrove with a positive HCHF repayment");
  }

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

  // Repay path verified per guide changelog (C2): approval = exact
  // repay amount = _debtChange consumed by the call (no gas-compensation
  // offset applies to partial repays - the 20 HCHF offset is closeTrove-only).
  const approve = exactApproveInner(APPROVALS.hchfToWrapper, args.ctx.userAccountId, repayAmount);
  return prepareAllowanceFlow(
    APPROVALS.hchfToWrapper, repayAmount, args.ctx, approve, exec,
    `Approve EXACT ${args.humanRepayAmount} HCHF for HCHFToken wrapper (batch-locked)`,
    "Adjust trove"
  );
}

/** stake(uint) on HLQTStaking 0.0.6070064 - approval #2 (HLQT -> HLQTToken wrapper). */
export async function buildStakeHLQT(args: AmountArgs): Promise<PreparedAllowanceFlow> {
  const amount = tokenUnits(args.humanAmount);
  if (amount === 0n) throw new Error("HLQT stake must be greater than zero");
  const approve = exactApproveInner(APPROVALS.hlqtToWrapper, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.hlqtStaking,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(amount))
  );
  return prepareAllowanceFlow(
    APPROVALS.hlqtToWrapper, amount, args.ctx, approve, exec,
    `Approve EXACT ${args.humanAmount} HLQT for HLQTToken wrapper (batch-locked)`,
    `Stake ${args.humanAmount} HLQT`
  );
}

/** stake(uint256) on SaucerSwapPool 0.0.6070133 - approval #3 (LP -> SaucerSwapPool). */
export async function buildStakeLP(args: AmountArgs): Promise<PreparedAllowanceFlow> {
  const amount = tokenUnits(args.humanAmount);
  if (amount === 0n) throw new Error("LP stake must be greater than zero");
  const approve = exactApproveInner(APPROVALS.lpToPool, args.ctx.userAccountId, amount);
  const exec = contractExecInner(
    CONTRACTS.saucerSwapPool,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(amount))
  );
  return prepareAllowanceFlow(
    APPROVALS.lpToPool, amount, args.ctx, approve, exec,
    `Approve EXACT ${args.humanAmount} LP for SaucerSwapPool (batch-locked)`,
    `Stake ${args.humanAmount} LP`
  );
}
