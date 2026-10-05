// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// flows.js - one async builder per guide §6.3 flow. Batched flows return a frozen,
// signed-ready BatchTransaction shaped [AccountAllowanceApproveTransaction (exact amount) FIRST,
// ContractExecuteTransaction LAST] per the HIP-551 rule (guide §4: at most ONE inner
// contract op and it MUST be the last inner, else pre-check INVALID_TRANSACTION_BODY).
// Non-batched flows return a single frozen, signed ContractExecuteTransaction.
// ONLY SDK APIs verified in guide section 4 are used:
//   BatchTransaction, AccountAllowanceApproveTransaction (.approveTokenAllowance),
//   ContractExecuteTransaction, ContractCallQuery, TokenAssociateTransaction, TransferTransaction,
//   TransactionReceiptQuery, TransactionId.generate, .setBatchKey, .batchify(client, key),
//   .freezeWith(client), .sign(key), .addInnerTransaction, .innerTransactionIds.

"use strict";

const {
  AccountAllowanceApproveTransaction,
  BatchTransaction,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  TokenAssociateTransaction,
  TransactionId,
} = require("@hashgraph/sdk");

const {
  CONTRACTS,
  TOKENS,
  APPROVALS,
  GAS,
  GAS_COMPENSATION_HCHF,
  GAS_COMPENSATION_UNITS,
  ZERO_ADDRESS,
  evm,
} = require("./config");

// ContractFunctionParameters.addUint256 accepts string | number | BigNumber in
// the 2.x SDK line - NOT BigInt. All uint arguments in this file pass through
// U() so BigInt amounts (tokenUnits/parseUint output) become decimal strings.
function U(value) {
  return typeof value === "bigint" ? value.toString() : value;
}

// Human-readable HCHF string for messages (8 decimals), e.g. 150000000000 -> "1500".
function hchf(baseUnits) {
  const whole = baseUnits / 10n ** 8n;
  const frac = baseUnits % 10n ** 8n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

// ---------------------------------------------------------------------------
// Low-level assembly helpers (guide §4 verified flow).
// ---------------------------------------------------------------------------

// Prepare one inner transaction: own transaction id (payer = user, which in
// this CLI is the operator account) then batchify = setBatchKey + signWithOperator
// (signWithOperator internally freezeWith(client) and forces nodeAccountId 0.0.0).
async function batchifyInner(tx, client, operatorKey, ownerId) {
  tx.setTransactionId(TransactionId.generate(ownerId));
  await tx.batchify(client, operatorKey);
  return tx;
}

// Assemble the outer batch. Single-key signing model (guide §4):
// the operator key is the batchKey of every inner, so signing the outer batch
// with that one key covers everything.
//
// SIGNING PATTERN NOTE (guide changelog (C6)): the community-validated
// wallet signing pattern is PER-TRANSACTION signing - the wallet signs each
// inner transaction and then the outer batch SEPARATELY (a community test on
// mainnet observed THREE HashPack prompts - one per inner + one for the outer -
// via hedera-wallet-connect 1.5.1 + HashPack >= 14.4.0, after which the dapp
// relays the signed bytes with hedera_executeTransaction). The single-prompt
// hedera_signAndExecuteTransaction path is a SEPARATE, still-unvalidated
// implementation (see frontend/useHederaBatch.ts). This CLI uses operator-key
// batchify/sign instead of wallet prompts, which is equivalent to the
// per-transaction model with one key.
async function assembleBatch(client, operatorKey, inners) {
  const batch = new BatchTransaction();
  for (const inner of inners) {
    batch.addInnerTransaction(inner); // throws unless inner is frozen + batchKey set
  }
  await batch.freezeWith(client);
  await batch.sign(operatorKey);
  return batch;
}

// Freeze + sign a standalone (non-batched) ContractExecuteTransaction.
async function finalizeSingle(tx, client, operatorKey) {
  const frozen = await tx.freezeWith(client);
  return frozen.sign(operatorKey);
}

function contractExec(contractId, gas, functionName, params, payableTinybar) {
  const tx = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(gas)
    .setFunction(functionName, params);
  if (payableTinybar && payableTinybar > 0n) {
    // Hbar factory takes string|number|BigNumber (not BigInt) - pass a decimal string.
    tx.setPayableAmount(Hbar.fromTinybars(payableTinybar.toString()));
  }
  return tx;
}

// Approve an EXACT amount so the post-batch residue allowance is 0
// (guide §2.1 batching rule). owner = user account (operator here).
function exactApprovalInner(pair, ownerId, amount) {
  return new AccountAllowanceApproveTransaction().approveTokenAllowance(
    pair.token,
    ownerId,
    pair.spender,
    amount
  );
}

// Hints (guide changelog (C7)): zero addresses are a FALLBACK that works at
// higher gas - always prefer live HintHelpers values; zero/empty hints are a
// test default, not a production choice.
function zeroHintParams() {
  return { upper: ZERO_ADDRESS, lower: ZERO_ADDRESS };
}

// ---------------------------------------------------------------------------
// Read path for redemption (guide §5/§6.3): PriceFeed.lastGoodPrice()
// then HintHelpers.getRedemptionHints(amount, price, maxIterations). Solidity
// types are (uint256, uint256, uint256) -> addUint256 x3.
// ---------------------------------------------------------------------------
async function readRedemptionHints(client, hchfAmount, maxIterations) {
  const priceResult = await new ContractCallQuery()
    .setContractId(CONTRACTS.priceFeed)
    .setGas(GAS.readQuery)
    .setFunction("lastGoodPrice", new ContractFunctionParameters())
    .execute(client);
  const price = priceResult.getUint256(0);

  const hintsResult = await new ContractCallQuery()
    .setContractId(CONTRACTS.hintHelpers)
    .setGas(GAS.readQuery)
    .setFunction(
      "getRedemptionHints",
      new ContractFunctionParameters()
        .addUint256(U(hchfAmount))
        .addUint256(U(price))
        .addUint256(U(maxIterations))
    )
    .execute(client);

  return {
    price,
    firstRedemptionHint: hintsResult.getAddress(0),
    partialRedemptionHintNICR: hintsResult.getUint256(1),
    // index 2: truncatedHCHFamount - the amount actually redeemable given
    // _maxIterations (guide changelog (C4)). Load-bearing: redeemCollateral
    // may consume LESS than requested, so the approve/call amounts must be
    // derived from this, not from the requested amount.
    truncatedHCHFAmount: hintsResult.getUint256(2),
    // index 3: lastTroveRedeemed (not needed here)
  };
}

// ---------------------------------------------------------------------------
// BATCHED FLOWS (guide §6.3). Shape: [approve FIRST, contract call LAST].
// Each builder receives { client, operatorKey, ownerId, params } and resolves to
// { kind: "batch", batch, allowanceCheck } where allowanceCheck tells the CLI
// which (token, spender) residue to verify on the mirror node afterwards.
// ---------------------------------------------------------------------------

// THE incident flow: redeemCollateral on TroveManager.
// redeemCollateral(uint _HCHFamount, address _firstRedemptionHint,
//   address _upperPartialRedemptionHint, address _lowerPartialRedemptionHint,
//   uint _partialRedemptionHintNICR, uint _maxIterations, uint _maxFeePercentage)
//
// REDEMPTION TRUNCATION (guide changelog (C4)): HintHelpers.getRedemptionHints
// returns truncatedHCHFAmount - the amount actually redeemable within
// _maxIterations. redeemCollateral can consume LESS than requested. Rules:
//   - truncated < requested  -> ABORT by default (user re-runs with a higher
//     --max-iterations or passes --allow-truncated).
//   - --allow-truncated      -> approve AND call with the truncated amount.
//     NEVER approve more than the call consumes.
// Honesty (C4): stale hints or on-chain state changes between the read and the
// batch can still cause the call to consume less than truncated - there is NO
// absolute zero-residue guarantee for large redemptions on the immutable
// contracts. Check the allowance residue after execution (the CLI's post-flight
// check) and keep redemptions small.
async function buildRedeem({ client, operatorKey, ownerId, params }) {
  const requested = params.amount; // base units (8 decimals)
  let effective = requested; // amount we approve AND call with
  let firstHint;
  let upper;
  let lower;
  let nicr;

  if (params.hints) {
    // --hints "upper,lower,nicr" override (EVM addresses + raw NICR) skips the
    // HintHelpers query, so truncatedHCHFAmount is UNKNOWN and the truncation
    // check cannot run. Refuse to guess: require --allow-truncated, which means
    // "I supplied my own hints and accept that the call may consume less than
    // the approved amount" (residue risk documented in C4).
    if (!params.allowTruncated) {
      throw new Error(
        "--hints skips the HintHelpers query, so redemption truncation cannot be checked; " +
          "re-run without --hints or pass --allow-truncated to accept the residue risk"
      );
    }
    ({ upper, lower, nicr } = params.hints);
    firstHint = ZERO_ADDRESS;
  } else {
    const hints = await readRedemptionHints(client, requested, params.maxIterations);
    firstHint = hints.firstRedemptionHint;
    upper = ZERO_ADDRESS; // fallback partial position, higher gas (C7: prefer live hints)
    lower = ZERO_ADDRESS;
    nicr = hints.partialRedemptionHintNICR;
    const truncated = hints.truncatedHCHFAmount;
    if (truncated < requested) {
      if (!params.allowTruncated) {
        throw new Error(
          `redemption would be truncated: only ${hchf(truncated)} of ${hchf(requested)} HCHF redeemable ` +
            `with maxIterations=${params.maxIterations} - re-run with --max-iterations ${params.maxIterations} ` +
            "or pass --allow-truncated"
        );
      }
      effective = truncated; // approve exactly what the call will consume
    }
  }

  const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, effective);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.troveManager,
    GAS.redeem,
    "redeemCollateral",
    new ContractFunctionParameters()
      .addUint256(U(effective))
      .addAddress(firstHint)
      .addAddress(upper)
      .addAddress(lower)
      .addUint256(U(nicr))
      .addUint256(U(params.maxIterations))
      .addUint256(U(params.maxFee))
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hchfToWrapper,
    approvedAmount: effective,
  };
}

// provideToSP(uint _amount, address _frontEndTag) on StabilityPool.
async function buildProvideSP({ client, operatorKey, ownerId, params }) {
  const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, params.amount);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.stabilityPool,
    GAS.stabilityPool,
    "provideToSP",
    new ContractFunctionParameters()
      .addUint256(U(params.amount))
      .addAddress(ZERO_ADDRESS) // no frontend tag
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hchfToWrapper,
    approvedAmount: params.amount,
  };
}

// repayHCHF(uint _amount, address _upperHint, address _lowerHint) on BorrowerOperations.
async function buildRepay({ client, operatorKey, ownerId, params }) {
  const { upper, lower } = zeroHintParams();
  const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, params.amount);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "repayHCHF",
    new ContractFunctionParameters()
      .addUint256(U(params.amount))
      .addAddress(upper)
      .addAddress(lower)
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hchfToWrapper,
    approvedAmount: params.amount,
  };
}

// closeTrove() on BorrowerOperations.
// *** SAFETY-CRITICAL (guide changelog (C2)) ***
// closeTrove burns DEBT - 20 HCHF from the USER and the 20 HCHF gas
// compensation from GasPool. The caller therefore repays NET DEBT = debt - 20.
// Approving the FULL debt would leave a 20 HCHF residue allowance on the
// HCHFToken wrapper - stealable by anyone via the ungated transferFrom
// (selector 0x15dacbea, CWE-862) that caused this incident. So:
//   --amount = FULL trove debt (validated: must be > 20 HCHF), and this builder
//   approves exactly amount - GAS_COMPENSATION (20 HCHF = 2_000_000_000 units).
async function buildCloseTrove({ client, operatorKey, ownerId, params }) {
  const fullDebt = params.amount;
  if (fullDebt <= GAS_COMPENSATION_UNITS) {
    throw new Error(
      `close-trove --amount must be the FULL debt (> ${GAS_COMPENSATION_HCHF} HCHF); got ${hchf(fullDebt)} HCHF`
    );
  }
  const netDebt = fullDebt - GAS_COMPENSATION_UNITS; // what closeTrove actually burns from the user
  const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, netDebt);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "closeTrove",
    new ContractFunctionParameters()
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hchfToWrapper,
    approvedAmount: netDebt,
  };
}

// adjustTrove(uint _maxFee, uint _collWithdrawal, uint _debtChange, bool
// isDebtIncrease, address _upperHint, address _lowerHint) payable - allowance #1
// only on the repay side (isDebtIncrease = false). Reference CLI supports the
// repay/add-coll shape: --amount = HCHF to repay (>0 => exact approval inner),
// --coll = HBAR to add (payable). Both zero => pure hint refresh, no approval.
// Repay path verified per guide changelog (C2): approval = exact repay
// amount = _debtChange consumed by the call (no gas-compensation offset applies
// to partial repays - the 20 HCHF offset is a closeTrove-only accounting).
async function buildAdjustTrove({ client, operatorKey, ownerId, params }) {
  const { upper, lower } = zeroHintParams();
  const repayAmount = params.amount; // HCHF base units to repay (0 = no repay)
  const payableTinybar = params.collTinybar || 0n;

  const exec = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "adjustTrove",
    new ContractFunctionParameters()
      .addUint256(U(params.maxFee))
      .addUint256(U(0n)) // _collWithdrawal (withdrawColl flow covers the other direction)
      .addUint256(U(repayAmount))
      .addBool(false) // isDebtIncrease = false (repay side)
      .addAddress(upper)
      .addAddress(lower),
    payableTinybar
  );

  const inners = [];
  if (repayAmount > 0n) {
    const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, repayAmount);
    await batchifyInner(approve, client, operatorKey, ownerId);
    inners.push(approve);
  }
  await batchifyInner(exec, client, operatorKey, ownerId);
  inners.push(exec); // contract op LAST (and only)

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, inners),
    allowanceCheck: repayAmount > 0n ? APPROVALS.hchfToWrapper : null,
    approvedAmount: repayAmount > 0n ? repayAmount : undefined,
  };
}

// stake(uint) on HLQTStaking - allowance #2 (HLQT -> HLQTToken wrapper).
async function buildStakeHLQT({ client, operatorKey, ownerId, params }) {
  const approve = exactApprovalInner(APPROVALS.hlqtToWrapper, ownerId, params.amount);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.hlqtStaking,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(params.amount))
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hlqtToWrapper,
    approvedAmount: params.amount,
  };
}

// stake(uint256) on SaucerSwapPool - allowance #3 (LP -> SaucerSwapPool).
async function buildStakeLP({ client, operatorKey, ownerId, params }) {
  const approve = exactApprovalInner(APPROVALS.lpToPool, ownerId, params.amount);
  await batchifyInner(approve, client, operatorKey, ownerId);

  const exec = contractExec(
    CONTRACTS.saucerSwapPool,
    GAS.stakingLp,
    "stake",
    new ContractFunctionParameters().addUint256(U(params.amount))
  );
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.lpToPool,
    approvedAmount: params.amount,
  };
}

// ---------------------------------------------------------------------------
// OPTIONAL native inner (guide §6.3, "First-time token use"): a
// TokenAssociateTransaction for the token about to be approved, placed BEFORE
// the approval. Association is a native op, not a contract op, so the
// one-contract-op-last rule is unaffected.
// ---------------------------------------------------------------------------
async function buildAssociateInner(tokenIds, client, operatorKey, ownerId) {
  const associate = new TokenAssociateTransaction()
    .setAccountId(ownerId)
    .setTokenIds(tokenIds);
  await batchifyInner(associate, client, operatorKey, ownerId);
  return associate;
}

// ---------------------------------------------------------------------------
// NON-BATCHED FLOWS (guide §6.3: "NO BATCH"). Single
// ContractExecuteTransaction, no allowance involved.
// ---------------------------------------------------------------------------

// openTrove(uint _maxFee, uint _HCHFAmount, address _upperHint, address _lowerHint) payable
async function buildOpenTrove({ client, operatorKey, params }) {
  const { upper, lower } = zeroHintParams();
  const tx = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "openTrove",
    new ContractFunctionParameters()
      .addUint256(U(params.maxFee))
      .addUint256(U(params.amount))
      .addAddress(upper)
      .addAddress(lower),
    params.collTinybar
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// addColl(address _upperHint, address _lowerHint) payable
async function buildAddColl({ client, operatorKey, params }) {
  const { upper, lower } = zeroHintParams();
  const tx = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "addColl",
    new ContractFunctionParameters().addAddress(upper).addAddress(lower),
    params.collTinybar
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// withdrawColl(uint _collWithdrawal, address _upperHint, address _lowerHint)
async function buildWithdrawColl({ client, operatorKey, params }) {
  const { upper, lower } = zeroHintParams();
  const tx = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "withdrawColl",
    new ContractFunctionParameters()
      .addUint256(U(params.amount)) // collateral amount, 8 decimals (HBAR base units)
      .addAddress(upper)
      .addAddress(lower)
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// withdrawHCHF(uint _maxFee, uint _amount, address _upperHint, address _lowerHint)
async function buildWithdrawHCHF({ client, operatorKey, params }) {
  const { upper, lower } = zeroHintParams();
  const tx = contractExec(
    CONTRACTS.borrowerOperations,
    GAS.troveOps,
    "withdrawHCHF",
    new ContractFunctionParameters()
      .addUint256(U(params.maxFee))
      .addUint256(U(params.amount))
      .addAddress(upper)
      .addAddress(lower)
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// withdrawFromSP(uint _amount) on StabilityPool (0 = gains only)
async function buildWithdrawSP({ client, operatorKey, params }) {
  const tx = contractExec(
    CONTRACTS.stabilityPool,
    GAS.stabilityPool,
    "withdrawFromSP",
    new ContractFunctionParameters().addUint256(U(params.amount))
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// unstake(uint) on HLQTStaking (0 = gains only)
async function buildUnstakeHLQT({ client, operatorKey, params }) {
  const tx = contractExec(
    CONTRACTS.hlqtStaking,
    GAS.stakingLp,
    "unstake",
    new ContractFunctionParameters().addUint256(U(params.amount))
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// withdraw(uint256) on SaucerSwapPool
async function buildWithdrawLP({ client, operatorKey, params }) {
  const tx = contractExec(
    CONTRACTS.saucerSwapPool,
    GAS.stakingLp,
    "withdraw",
    new ContractFunctionParameters().addUint256(U(params.amount))
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// claimReward() on SaucerSwapPool
async function buildClaimLP({ client, operatorKey }) {
  const tx = contractExec(
    CONTRACTS.saucerSwapPool,
    GAS.stakingLp,
    "claimReward",
    new ContractFunctionParameters()
  );
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

// liquidate(address _borrower) / liquidateTroves(uint _n) on TroveManager - no
// user allowance needed. --borrower accepts a Hedera id (0.0.x, converted to the
// long-zero EVM address) or an explicit 0x EVM address; --n switches to liquidateTroves.
async function buildLiquidate({ client, operatorKey, params }) {
  let tx;
  if (params.n != null) {
    tx = contractExec(
      CONTRACTS.troveManager,
      GAS.liquidate,
      "liquidateTroves",
      new ContractFunctionParameters().addUint256(U(params.n))
    );
  } else {
    const borrowerEvm = params.borrower.startsWith("0x")
      ? params.borrower
      : evm(params.borrower);
    tx = contractExec(
      CONTRACTS.troveManager,
      GAS.liquidate,
      "liquidate",
      new ContractFunctionParameters().addAddress(borrowerEvm)
    );
  }
  return { kind: "single", tx: await finalizeSingle(tx, client, operatorKey), allowanceCheck: null };
}

module.exports = {
  // batched
  buildRedeem,
  buildProvideSP,
  buildRepay,
  buildCloseTrove,
  buildAdjustTrove,
  buildStakeHLQT,
  buildStakeLP,
  buildAssociateInner,
  // non-batched
  buildOpenTrove,
  buildAddColl,
  buildWithdrawColl,
  buildWithdrawHCHF,
  buildWithdrawSP,
  buildUnstakeHLQT,
  buildWithdrawLP,
  buildClaimLP,
  buildLiquidate,
  // reads
  readRedemptionHints,
};
