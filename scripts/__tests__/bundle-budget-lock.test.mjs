import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateBundleBudgetLock } from "../lib/bundle-budget-metrics.mjs";

const baseline = {
  recordedAt: "2026-05-27",
  metrics: {
    total_client_js_kb: 10000,
    messenger_home_js_kb: 3000,
    messenger_room_js_kb: 2500,
    messenger_call_js_kb: 4000,
  },
  growth_slack_kb: {
    total_client_js: 500,
    messenger_home_js: 200,
    messenger_room_js: 200,
    messenger_call_js: 300,
  },
};

function measuredKb(totalKb, homeKb, roomKb, callKb) {
  return {
    totalBytes: totalKb * 1024,
    entries: [],
    messenger: {
      home: { bytes: homeKb * 1024, refsCount: 10 },
      room: { bytes: roomKb * 1024, refsCount: 8 },
      call: { bytes: callKb * 1024, refsCount: 9 },
    },
  };
}

test("passes when within baseline + slack", () => {
  const { failures } = evaluateBundleBudgetLock(baseline, measuredKb(10400, 3100, 2600, 4200));
  assert.equal(failures.length, 0);
});

test("fails when total exceeds baseline + slack", () => {
  const { failures } = evaluateBundleBudgetLock(baseline, measuredKb(10600, 3100, 2600, 4200));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].key, "total_client_js");
});

test("fails messenger call when over slack", () => {
  const { failures } = evaluateBundleBudgetLock(baseline, measuredKb(10000, 3000, 2500, 4310));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].key, "messenger_call_js");
});
