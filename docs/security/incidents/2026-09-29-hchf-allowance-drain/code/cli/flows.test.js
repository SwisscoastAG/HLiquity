"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { readRedemptionHints, trialChunks } = require("./flows");

const FIRST = "0x0000000000000000000000000000000000000001";
const APPROX = "0x0000000000000000000000000000000000000002";
const UPPER = "0x0000000000000000000000000000000000000003";
const LOWER = "0x0000000000000000000000000000000000000004";

function value(number) {
  return { toString: () => String(number) };
}

test("redemption eth_call preflight uses fetchPrice and returns live partial insertion hints", async () => {
  const calls = [];
  const reader = {
    async fetchPrice() {
      calls.push({ name: "fetchPrice" });
      return value(1000);
    },
    async getRedemptionHints(amount, price, maxIterations) {
      calls.push({ name: "getRedemptionHints", amount, price, maxIterations });
      return [FIRST, value(555), value(100000000)];
    },
    async getTroveOwnersCount() {
      calls.push({ name: "getTroveOwnersCount" });
      return value(4);
    },
    async getApproxHint(nicr, trials, seed) {
      calls.push({ name: "getApproxHint", nicr, trials, seed });
      return [APPROX, value(7), value(99)];
    },
    async findInsertPosition(nicr, upper, lower) {
      calls.push({ name: "findInsertPosition", nicr, upper, lower });
      return [UPPER, LOWER];
    },
  };

  const hints = await readRedemptionHints(
    "https://unused.invalid",
    100000000n,
    1,
    { reader, seed: 42n }
  );

  assert.deepEqual(calls.map(call => call.name), [
    "fetchPrice",
    "getRedemptionHints",
    "getTroveOwnersCount",
    "getApproxHint",
    "findInsertPosition",
  ]);
  assert.equal(hints.firstRedemptionHint, FIRST);
  assert.equal(hints.upperPartialRedemptionHint, UPPER);
  assert.equal(hints.lowerPartialRedemptionHint, LOWER);
  assert.equal(hints.truncatedHCHFAmount.toString(), "100000000");
  assert.equal(calls[1].price, "1000");
  assert.equal(calls[1].maxIterations, 1);
  assert.equal(calls[4].upper, APPROX);
  assert.equal(calls[4].lower, APPROX);
});

test("zero partial NICR does not run insertion-hint queries", async () => {
  const calls = [];
  const reader = {
    async fetchPrice() {
      calls.push("fetchPrice");
      return value(1000);
    },
    async getRedemptionHints() {
      calls.push("getRedemptionHints");
      return [FIRST, value(0), value(100000000)];
    },
  };

  const hints = await readRedemptionHints(
    "https://unused.invalid",
    100000000n,
    1,
    { reader, seed: 42n }
  );

  assert.deepEqual(calls, ["fetchPrice", "getRedemptionHints"]);
  assert.equal(hints.upperPartialRedemptionHint, "0x0000000000000000000000000000000000000000");
  assert.equal(hints.lowerPartialRedemptionHint, "0x0000000000000000000000000000000000000000");
});

test("large approximation searches are split into bounded query chunks", () => {
  assert.deepEqual(trialChunks(6001), [2500, 2500, 1001]);
});
