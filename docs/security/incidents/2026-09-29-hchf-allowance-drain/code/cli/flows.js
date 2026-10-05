// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// flows.js - one async builder per guide §6.3 flow. Batched flows return a frozen,
// signed-ready BatchTransaction shaped [AccountAllowanceApproveTransaction (exact amount) FIRST,
// ContractExecuteTransaction LAST] per the HIP-551 rule (guide §4: at most ONE inner
// contract op and it MUST be the last inner, else pre-check INVALID_TRANSACTION_BODY).
// Non-batched flows return a single frozen, signed ContractExecuteTransaction.
// The write path uses SDK APIs verified in guide section 4:
//   BatchTransaction, AccountAllowanceApproveTransaction (.approveTokenAllowance),
//   ContractExecuteTransaction, ContractCallQuery, TokenAssociateTransaction, TransferTransaction,
//   TransactionReceiptQuery, TransactionId.generate, .setBatchKey, .batchify(client, key),
//   .freezeWith(client), .sign(key), .addInnerTransaction, .innerTransactionIds.
// The redemption preflight uses ethers JSON-RPC eth_call, matching the established frontend.

"use strict";

const crypto = require("node:crypto");
const { ethers } = require("ethers");

const {
  AccountAllowanceApproveTransaction,
  BatchTransaction,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  Long,
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
  MIN_NET_DEBT_HCHF,
  MIN_NET_DEBT_UNITS,
  ZERO_ADDRESS,
  evm,
} = require("./config");

const PRICE_FEED_ABI = ["function fetchPrice() returns (uint256)"];
const HINT_HELPERS_ABI = [
  "function getRedemptionHints(uint256,uint256,uint256) view returns (address,uint256,uint256)",
  "function getApproxHint(uint256,uint256,uint256) view returns (address,uint256,uint256)",
];
const TROVE_MANAGER_READ_ABI = ["function getTroveOwnersCount() view returns (uint256)"];
const SORTED_TROVES_ABI = [
  "function findInsertPosition(uint256,address,address) view returns (address,address)",
];

// ContractFunctionParameters.addUint256 accepts string | number | BigNumber in
// the 2.x SDK line - NOT BigInt. All uint arguments in this file pass through
// U() so BigInt amounts (tokenUnits/parseUint output) become decimal strings.
function U(value) {
  return typeof value === "number" ? value : value.toString();
}

// Human-readable HCHF string for messages (8 decimals), e.g. 150000000000 -> "1500".
function hchf(baseUnits) {
  const whole = baseUnits / 10n ** 8n;
  const frac = baseUnits % 10n ** 8n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

function requirePositiveAmount(amount, label) {
  if (typeof amount !== "bigint" || amount <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
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
// relays the fully signed bytes with hedera_executeTransaction). The frontend
// intentionally exposes no alternate or non-atomic submission path. This CLI uses operator-key
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
    Long.fromString(amount.toString(), true, 10)
  );
}

// Zero addresses are accepted by SortedTroves as a slower full-list fallback
// for BorrowerOperations flows. Redemption is different: when a partial
// redemption NICR is returned, derive its live insertion hints below so this
// CLI follows the same path as the established frontend.
function zeroHintParams() {
  return { upper: ZERO_ADDRESS, lower: ZERO_ADDRESS };
}

// ---------------------------------------------------------------------------
// Read path for redemption (guide §5/§6.3), matching the established frontend.
// These simulations use JSON-RPC eth_call, not SDK ContractCallQuery: Hedera
// rejects fetchPrice() as a local query because it can write lastGoodPrice,
// whereas eth_call executes the same EVM path and discards state changes.
//   1. simulate PriceFeed.fetchPrice() because redeemCollateral calls it too;
//   2. getRedemptionHints(amount, price, maxIterations);
//   3. for a non-zero partial NICR, getApproxHint() and then the exact
//      SortedTroves.findInsertPosition().
// A later price/list change can still stale the result; atomic rollback keeps
// the allowance safe if that happens.
// ---------------------------------------------------------------------------
function createRedemptionReader(relayUrl) {
  if (!relayUrl || typeof relayUrl !== "string") {
    throw new Error("JSON-RPC relay URL is required for redemption preflight");
  }
  const provider = new ethers.providers.StaticJsonRpcProvider(relayUrl);
  const priceFeed = new ethers.Contract(evm(CONTRACTS.priceFeed), PRICE_FEED_ABI, provider);
  const hintHelpers = new ethers.Contract(evm(CONTRACTS.hintHelpers), HINT_HELPERS_ABI, provider);
  const troveManager = new ethers.Contract(
    evm(CONTRACTS.troveManager),
    TROVE_MANAGER_READ_ABI,
    provider
  );
  const sortedTroves = new ethers.Contract(
    evm(CONTRACTS.sortedTroves),
    SORTED_TROVES_ABI,
    provider
  );

  return {
    fetchPrice: () => priceFeed.callStatic.fetchPrice(),
    getRedemptionHints: (amount, price, maxIterations) =>
      hintHelpers.callStatic.getRedemptionHints(amount, price, maxIterations),
    getTroveOwnersCount: () => troveManager.callStatic.getTroveOwnersCount(),
    getApproxHint: (nicr, numberOfTrials, seed) =>
      hintHelpers.callStatic.getApproxHint(nicr, numberOfTrials, seed),
    findInsertPosition: (nicr, upperHint, lowerHint) =>
      sortedTroves.callStatic.findInsertPosition(nicr, upperHint, lowerHint),
  };
}

function trialChunks(totalNumberOfTrials, maximumPerQuery = 2500) {
  const chunks = [];
  let remaining = totalNumberOfTrials;
  while (remaining > 0) {
    const next = Math.min(remaining, maximumPerQuery);
    chunks.push(next);
    remaining -= next;
  }
  return chunks;
}

function randomUint256() {
  return BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);
}

async function findPartialRedemptionHints(
  reader,
  partialRedemptionHintNICR,
  seed = randomUint256()
) {
  const nicr = BigInt(partialRedemptionHintNICR.toString());
  if (nicr === 0n) {
    return { upper: ZERO_ADDRESS, lower: ZERO_ADDRESS };
  }

  const countResult = await reader.getTroveOwnersCount();
  const numberOfTroves = Number(countResult.toString());
  if (!Number.isSafeInteger(numberOfTroves) || numberOfTroves < 0) {
    throw new Error(`invalid trove count returned by TroveManager: ${numberOfTroves}`);
  }
  if (numberOfTroves === 0) {
    return { upper: ZERO_ADDRESS, lower: ZERO_ADDRESS };
  }

  const totalTrials = Math.ceil(10 * Math.sqrt(numberOfTroves));
  let latestRandomSeed = BigInt(seed.toString());
  let bestHint = ZERO_ADDRESS;
  let bestDiff = null;

  for (const numberOfTrials of trialChunks(totalTrials)) {
    const approxResult = await reader.getApproxHint(
      U(nicr),
      U(numberOfTrials),
      U(latestRandomSeed)
    );

    const candidate = approxResult[0];
    const diff = BigInt(approxResult[1].toString());
    latestRandomSeed = BigInt(approxResult[2].toString());
    if (bestDiff === null || diff < bestDiff) {
      bestDiff = diff;
      bestHint = candidate;
    }
  }

  const positionResult = await reader.findInsertPosition(U(nicr), bestHint, bestHint);

  return {
    upper: positionResult[0],
    lower: positionResult[1],
  };
}

async function readRedemptionHints(
  relayUrl,
  hchfAmount,
  maxIterations,
  options = {}
) {
  const reader = options.reader || createRedemptionReader(relayUrl);
  const price = await reader.fetchPrice();
  const hintsResult = await reader.getRedemptionHints(
    U(hchfAmount),
    U(price),
    U(maxIterations)
  );

  const partialRedemptionHintNICR = hintsResult[1];
  const { upper, lower } = await findPartialRedemptionHints(
    reader,
    partialRedemptionHintNICR,
    options.seed
  );

  return {
    price,
    firstRedemptionHint: hintsResult[0],
    partialRedemptionHintNICR,
    upperPartialRedemptionHint: upper,
    lowerPartialRedemptionHint: lower,
    // index 2: truncatedHCHFamount - the amount actually redeemable given
    // _maxIterations (guide changelog (C4)). Load-bearing: redeemCollateral
    // may consume LESS than requested, so the approve/call amounts must be
    // derived from this, not from the requested amount.
    truncatedHCHFAmount: hintsResult[2],
  };
}

async function readEntireTroveDebt(client, ownerId) {
  const result = await new ContractCallQuery()
    .setContractId(CONTRACTS.troveManager)
    .setGas(GAS.readQuery)
    .setFunction(
      "getEntireDebtAndColl",
      new ContractFunctionParameters().addAddress(ownerId.toSolidityAddress())
    )
    .execute(client);
  return BigInt(result.getUint256(0).toString());
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
// The mainnet-proven safety shape is one iteration, no truncation, and an amount
// <= MIN_NET_DEBT. The first trove then either consumes the full request or the
// call reverts before committing any approval. Split larger exits into repeated
// batches of at most MIN_NET_DEBT.
async function buildRedeem({ client, operatorKey, ownerId, params }) {
  const requested = params.amount; // base units (8 decimals)
  if (requested <= 0n || requested > MIN_NET_DEBT_UNITS) {
    throw new Error(
      `redeem amount must be > 0 and <= ${MIN_NET_DEBT_HCHF} HCHF; split larger exits into chunks`
    );
  }
  const maxIterations = 1;
  const hints = await readRedemptionHints(
    params.jsonRpcRelay,
    requested,
    maxIterations
  );
  if (BigInt(hints.truncatedHCHFAmount.toString()) !== requested) {
    throw new Error(
      `redemption preflight is not exact: requested ${hchf(requested)} HCHF, redeemable ${hchf(BigInt(hints.truncatedHCHFAmount.toString()))} HCHF`
    );
  }
  const effective = requested;
  const firstHint = hints.firstRedemptionHint;
  const upper = hints.upperPartialRedemptionHint;
  const lower = hints.lowerPartialRedemptionHint;
  const nicr = hints.partialRedemptionHintNICR;

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
      .addUint256(U(maxIterations))
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
  requirePositiveAmount(params.amount, "Stability Pool deposit");
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
  requirePositiveAmount(params.amount, "repayment");
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
// The amount is read from TroveManager.getEntireDebtAndColl immediately before
// signing; accepting a user-entered overestimate would leave stealable residue.
async function buildCloseTrove({ client, operatorKey, ownerId, params }) {
  const fullDebt = await readEntireTroveDebt(client, ownerId);
  if (fullDebt <= GAS_COMPENSATION_UNITS) {
    throw new Error(
      `current entire debt must be > ${GAS_COMPENSATION_HCHF} HCHF; got ${hchf(fullDebt)} HCHF`
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
// --coll = HBAR to add (payable). A collateral-only adjustment is returned as
// a standalone contract call because it creates no allowance.
// Repay path verified per guide changelog (C2): approval = exact repay
// amount = _debtChange consumed by the call (no gas-compensation offset applies
// to partial repays - the 20 HCHF offset is a closeTrove-only accounting).
async function buildAdjustTrove({ client, operatorKey, ownerId, params }) {
  const { upper, lower } = zeroHintParams();
  const repayAmount = params.amount || 0n; // HCHF base units to repay (0 = no repay)
  const payableTinybar = params.collTinybar || 0n;
  if (repayAmount === 0n && payableTinybar === 0n) {
    throw new Error("adjust-trove requires a positive --amount and/or --coll");
  }

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

  if (repayAmount === 0n) {
    return {
      kind: "single",
      tx: await finalizeSingle(exec, client, operatorKey),
      allowanceCheck: null,
    };
  }

  const approve = exactApprovalInner(APPROVALS.hchfToWrapper, ownerId, repayAmount);
  await batchifyInner(approve, client, operatorKey, ownerId);
  await batchifyInner(exec, client, operatorKey, ownerId);

  return {
    kind: "batch",
    batch: await assembleBatch(client, operatorKey, [approve, exec]),
    allowanceCheck: APPROVALS.hchfToWrapper,
    approvedAmount: repayAmount,
  };
}

// stake(uint) on HLQTStaking - allowance #2 (HLQT -> HLQTToken wrapper).
async function buildStakeHLQT({ client, operatorKey, ownerId, params }) {
  requirePositiveAmount(params.amount, "HLQT stake");
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
  requirePositiveAmount(params.amount, "LP stake");
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
  createRedemptionReader,
  findPartialRedemptionHints,
  readRedemptionHints,
  trialChunks,
};
