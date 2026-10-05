#!/usr/bin/env node
// Reference artifact for the batch-transaction exit guide - per the guide (single source of truth).
// hliquity-batch.js - CLI entry: build -> sign -> execute -> print batch/tx id -> per-inner
// TransactionReceiptQuery receipts -> mirror-node allowance-residue check.
// Security: keys come from .env only (never hardcode, never log). Testnet first, then mainnet
// with small amounts.

"use strict";

// ---------------------------------------------------------------------------
// Usage text lives at the top so `--help` works even when dependencies are not
// installed yet (no @hashgraph/sdk require happens on the help path).
// ---------------------------------------------------------------------------
const USAGE = `hliquity-batch - HIP-551 batch emergency exit for HLiquity (the guide reference CLI)

Usage: node hliquity-batch.js <command> [flags]

BATCHED flows (approve FIRST + contract call LAST, atomic - closes the sweep race):
  redeem         --amount <HCHF> [--max-fee <raw|NeM>] [--max-iterations <n>] [--hints "upper,lower,nicr"] [--allow-truncated] [--associate]
  provide-sp     --amount <HCHF> [--associate]
  repay          --amount <HCHF> [--associate]
  close-trove    --amount <HCHF>  (FULL debt, must be > 20 HCHF; approval = debt - 20 net) [--associate]
  adjust-trove   [--amount <HCHF to repay>] [--coll <HBAR to add>] [--max-fee <raw|NeM>] [--associate]
  stake-hlqt     --amount <HLQT> [--associate]
  stake-lp       --amount <LP>  [--associate]

NON-BATCHED flows (single ContractExecuteTransaction, no allowance involved):
  open-trove     --amount <HCHF> --coll <HBAR> [--max-fee <raw|NeM>]
  add-coll       --coll <HBAR>
  withdraw-coll  --amount <HBAR>
  withdraw-hchf  --amount <HCHF> [--max-fee <raw|NeM>]
  withdraw-sp    --amount <HCHF>  (0 = gains only)
  unstake-hlqt   --amount <HLQT>  (0 = gains only)
  withdraw-lp    --amount <LP>
  claim-lp
  liquidate      --borrower <0.0.x|0x...>  |  --n <count> (liquidateTroves)

Flags:
  --amount          human token/HBAR amount (HCHF, HLQT, LP, HBAR all have 8 decimals)
  --coll            human HBAR payable amount (open-trove / add-coll / adjust-trove)
  --max-fee         raw uint or NeM form, default 100000000 (1e8 = 100%, 8-decimal maxFeePercentage;
                    0.5% floor = 500000) - see guide changelog (C3)
  --max-iterations  redeem hint cap, default 10
  --hints           "upperPartialRedemptionHint,lowerPartialRedemptionHint,partialRedemptionHintNICR"
                    (EVM 0x addresses + raw NICR; skips the HintHelpers query, so redemption
                    truncation cannot be checked - requires --allow-truncated)
  --allow-truncated redeem: if HintHelpers reports less HCHF redeemable than requested within
                    --max-iterations, approve AND call with that truncated amount instead of aborting
  --associate       prepend a TokenAssociateTransaction for the flow's token (first-time use)
  --network         testnet|mainnet (default: NETWORK from .env)
  --help            this text

close-trove note (guide changelog (C2) - SAFETY-CRITICAL): closeTrove burns debt - 20 HCHF
from you and 20 HCHF from GasPool. Approve exactly net debt = full debt - 20 HCHF: passing the
full debt would leave a 20 HCHF stealable allowance on the wrapper. This CLI computes the
approval internally as --amount - 20 HCHF.

Environment (.env, see .env.example): OPERATOR_ID, OPERATOR_KEY_DER, NETWORK, optional MIRROR_NODE_URL
Exit codes: 0 success, 1 failure.
`;

// ---------------------------------------------------------------------------
// Minimal flag parsing (no dependencies beyond dotenv).
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true; // boolean flag (e.g. --associate)
      } else {
        flags[key] = next;
        i += 1;
      }
    }
  }
  return { command, flags };
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Mirror-node read helpers (read-only verification only; Node 18+ global fetch).
// ---------------------------------------------------------------------------
async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Pre-flight: is the owner associated to the token we are about to approve/spend?
async function checkTokenAssociated(mirror, ownerId, tokenId) {
  const data = await fetchJson(
    `${mirror}/api/v1/accounts/${ownerId}/tokens?token.id=${tokenId}&limit=1`
  );
  const associated = Boolean(data && Array.isArray(data.tokens) && data.tokens.length > 0);
  return { associated, tokenId };
}

// Post-flight: the flow's allowance residue must be zero.
async function checkAllowanceResidue(mirror, ownerId, pair) {
  const data = await fetchJson(
    `${mirror}/api/v1/accounts/${ownerId}/allowances/tokens?limit=100`
  );
  const rows = (data && data.allowances) || [];
  const match = rows.find(
    (row) => row.token_id === pair.token && row.spender === pair.spender
  );
  return {
    pair,
    granted: Boolean(match),
    residue: match ? match.amount : "0",
    clean: !match || match.amount === "0",
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  const { command, flags } = parseArgs(argv);

  // Load config + env (dotenv) and the SDK only now, so --help never needs them.
  require("dotenv").config();
  const {
    Client,
    PrivateKey,
    TransactionReceiptQuery,
    AccountId,
  } = require("@hashgraph/sdk");
  const config = require("./config");
  const flows = require("./flows");

  const networkName = flags.network || process.env.NETWORK || "testnet";
  const network = config.NETWORKS[networkName];
  if (!network) {
    throw new Error(`Unknown --network "${networkName}" (expected testnet|mainnet)`);
  }
  const mirror = process.env.MIRROR_NODE_URL || network.mirror;

  const operatorIdStr = process.env.OPERATOR_ID;
  const operatorKeyDer = process.env.OPERATOR_KEY_DER;
  if (!operatorIdStr || !operatorKeyDer) {
    throw new Error("OPERATOR_ID / OPERATOR_KEY_DER missing - copy .env.example to .env and fill it in");
  }
  const operatorKey = PrivateKey.fromString(operatorKeyDer); // DER hex; use fromStringED25519 for raw 32-byte hex
  const ownerId = AccountId.fromString(operatorIdStr); // userId = operator account in this CLI
  const client = networkName === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(ownerId, operatorKey);

  // maxFeePercentage is 8-DECIMAL (guide changelog (C3): BaseMath
  // DECIMAL_PRECISION = 1e8): 100% = 1e8 = 100000000, 0.5% floor = 500000.
  const maxFee = config.parseUint(flags["max-fee"] || "100000000");
  const amount = flags.amount !== undefined ? config.tokenUnits(flags.amount) : null;
  const collTinybar = flags.coll !== undefined ? config.tokenUnits(flags.coll) : null;
  const maxIterations =
    flags["max-iterations"] !== undefined ? Number(flags["max-iterations"]) : 10;

  if (flags.amount !== undefined && amount === null) {
    throw new Error("--amount must be a non-negative decimal number");
  }

  let hints = null;
  if (flags.hints) {
    const parts = String(flags.hints).split(",").map((s) => s.trim());
    if (parts.length !== 3 || !parts.every(Boolean)) {
      throw new Error('--hints expects "upper,lower,nicr"');
    }
    hints = { upper: parts[0], lower: parts[1], nicr: BigInt(parts[2]) };
  }

  const ctx = { client, operatorKey, ownerId, params: { amount, maxFee, maxIterations, hints, allowTruncated: Boolean(flags["allow-truncated"]), collTinybar, n: null, borrower: null } };

  // ---- command -> builder map ------------------------------------------------
  const commandMap = {
    redeem: () => {
      if (amount === null) throw new Error("redeem requires --amount <HCHF>");
      return flows.buildRedeem(ctx);
    },
    "provide-sp": () => {
      if (amount === null) throw new Error("provide-sp requires --amount <HCHF>");
      return flows.buildProvideSP(ctx);
    },
    "withdraw-sp": () => {
      if (amount === null) throw new Error("withdraw-sp requires --amount <HCHF> (0 = gains only)");
      return flows.buildWithdrawSP(ctx);
    },
    repay: () => {
      if (amount === null) throw new Error("repay requires --amount <HCHF>");
      return flows.buildRepay(ctx);
    },
    "close-trove": () => {
      if (amount === null) throw new Error("close-trove requires --amount <HCHF> (FULL debt, must be > 20 HCHF)");
      return flows.buildCloseTrove(ctx);
    },
    "adjust-trove": () => flows.buildAdjustTrove(ctx),
    "stake-hlqt": () => {
      if (amount === null) throw new Error("stake-hlqt requires --amount <HLQT>");
      return flows.buildStakeHLQT(ctx);
    },
    "unstake-hlqt": () => {
      if (amount === null) throw new Error("unstake-hlqt requires --amount <HLQT> (0 = gains only)");
      return flows.buildUnstakeHLQT(ctx);
    },
    "stake-lp": () => {
      if (amount === null) throw new Error("stake-lp requires --amount <LP>");
      return flows.buildStakeLP(ctx);
    },
    "withdraw-lp": () => {
      if (amount === null) throw new Error("withdraw-lp requires --amount <LP>");
      return flows.buildWithdrawLP(ctx);
    },
    "claim-lp": () => flows.buildClaimLP(ctx),
    "open-trove": () => {
      if (amount === null || collTinybar === null) {
        throw new Error("open-trove requires --amount <HCHF> and --coll <HBAR>");
      }
      return flows.buildOpenTrove(ctx);
    },
    "add-coll": () => {
      if (collTinybar === null) throw new Error("add-coll requires --coll <HBAR>");
      return flows.buildAddColl(ctx);
    },
    "withdraw-coll": () => {
      if (amount === null) throw new Error("withdraw-coll requires --amount <HBAR>");
      return flows.buildWithdrawColl(ctx);
    },
    "withdraw-hchf": () => {
      if (amount === null) throw new Error("withdraw-hchf requires --amount <HCHF>");
      return flows.buildWithdrawHCHF(ctx);
    },
    liquidate: () => {
      if (flags.n !== undefined) {
        ctx.params.n = config.parseUint(flags.n);
      } else if (flags.borrower) {
        ctx.params.borrower = String(flags.borrower);
      } else {
        throw new Error("liquidate requires --borrower <0.0.x|0x...> or --n <count>");
      }
      return flows.buildLiquidate(ctx);
    },
  };

  const build = commandMap[command];
  if (!build) {
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    process.exit(1);
  }

  console.log(`[hliquity-batch] network=${networkName} operator=${ownerId.toString()} command=${command}`);

  // ---- optional native associate inner (guide §6.3, first-time use) --
  const built = await build();
  if (built.kind === "batch" && built.approvedAmount !== undefined) {
    console.log(
      `[hliquity-batch] approval inner approves EXACTLY ${built.approvedAmount} base units` +
        (built.allowanceCheck ? ` (${built.allowanceCheck.label})` : "")
    );
  }
  if (flags.associate && built.kind === "batch" && built.allowanceCheck) {
    const tokenId = built.allowanceCheck.token;
    const assoc = await flows.buildAssociateInner([tokenId], client, operatorKey, ownerId);
    // Rebuild the batch so association lands BEFORE the approval (native inner
    // first, approve second, contract op last).
    const inners = [assoc, ...built.batch.innerTransactions];
    const { BatchTransaction } = require("@hashgraph/sdk");
    const batch = new BatchTransaction();
    for (const inner of inners) batch.addInnerTransaction(inner);
    await batch.freezeWith(client);
    await batch.sign(operatorKey);
    built.batch = batch;
    console.log(`[hliquity-batch] prepended TokenAssociate for ${tokenId}`);
  }

  // ---- pre-flight association check (warn only, exit code unaffected) --------
  if (built.allowanceCheck) {
    const { associated, tokenId } = await checkTokenAssociated(
      mirror,
      ownerId.toString(),
      built.allowanceCheck.token
    );
    if (!associated) {
      console.warn(`[hliquity-batch] WARN: ${ownerId.toString()} is not associated to ${tokenId}.`);
      console.warn("[hliquity-batch] WARN: re-run with --associate or the inner transaction will fail (and the whole batch will roll back).");
    }
  }

  // ---- execute ----------------------------------------------------------------
  if (built.kind === "batch") {
    const batch = built.batch;
    console.log(`[hliquity-batch] executing ATOMIC batch with ${batch.innerTransactions.length} inner txs (contract op is LAST)`);
    const response = await batch.execute(client);
    const batchId = response.transactionId.toString();
    console.log(`[hliquity-batch] batch id: ${batchId}`);
    const receipt = await response.getReceipt(client);
    console.log(`[hliquity-batch] batch status: ${receipt.status.toString()}`);

    console.log("[hliquity-batch] per-inner receipts:");
    for (const innerId of batch.innerTransactionIds) {
      const innerReceipt = await new TransactionReceiptQuery()
        .setTransactionId(innerId)
        .execute(client);
      console.log(`  - ${innerId.toString()}: ${innerReceipt.status.toString()}`);
    }
  } else {
    const tx = built.tx;
    const response = await tx.execute(client);
    console.log(`[hliquity-batch] tx id: ${response.transactionId.toString()}`);
    const receipt = await response.getReceipt(client);
    console.log(`[hliquity-batch] status: ${receipt.status.toString()}`);
  }

  // ---- post-flight allowance residue check --------------
  if (built.allowanceCheck) {
    const check = await checkAllowanceResidue(mirror, ownerId.toString(), built.allowanceCheck);
    if (check.clean) {
      console.log(
        `[hliquity-batch] allowance check OK: residue for ${built.allowanceCheck.label} is 0 (nothing left for a sweeper to drain)`
      );
    } else {
      console.warn(
        `[hliquity-batch] WARN: residue allowance remains on ${built.allowanceCheck.label}: amount=${check.residue}`
      );
    }
  }

  client.close();
  process.exit(0);
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  // Never leak key material: only the message string is printed.
  console.error(`[hliquity-batch] ERROR: ${message}`);
  process.exit(1);
});
