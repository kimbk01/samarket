import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateBundleBudgetLock,
  validateBaselineIntegrity,
  BASELINE_MEASUREMENT_VERSION,
} from "../lib/bundle-budget-metrics.mjs";

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
  provenance: {
    measurement_version: BASELINE_MEASUREMENT_VERSION,
    chunk_file_count: 100,
    bytes: {
      total_client_js: 10000 * 1024,
      messenger_home_js: 3000 * 1024,
      messenger_room_js: 2500 * 1024,
      messenger_call_js: 4000 * 1024,
    },
  },
  top_chunks: [{ path: ".next/static/chunks/a.js", kb: 500 }],
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
  assert.equal(failures[0].direction, "over_max");
});

test("fails messenger call when over slack", () => {
  const { failures } = evaluateBundleBudgetLock(baseline, measuredKb(10000, 3000, 2500, 4310));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].key, "messenger_call_js");
});

test("fails when inflated baseline is far above actual (stale baseline)", () => {
  const { failures } = evaluateBundleBudgetLock(baseline, measuredKb(10000, 2700, 2500, 4000));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].key, "messenger_home_js");
  assert.equal(failures[0].direction, "under_min");
});

test("validateBaselineIntegrity rejects missing provenance", () => {
  const result = validateBaselineIntegrity({ metrics: baseline.metrics, top_chunks: baseline.top_chunks });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /provenance/);
});

test("validateBaselineIntegrity rejects metrics/provenance byte mismatch", () => {
  const corrupt = {
    ...baseline,
    metrics: { ...baseline.metrics, total_client_js_kb: 9999 },
  };
  const result = validateBaselineIntegrity(corrupt);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("total_client_js_kb")));
});

test("validateBaselineIntegrity rejects messenger bytes exceeding total", () => {
  const corrupt = {
    ...baseline,
    provenance: {
      ...baseline.provenance,
      bytes: {
        ...baseline.provenance.bytes,
        messenger_home_js: baseline.provenance.bytes.total_client_js + 1024,
      },
    },
  };
  const result = validateBaselineIntegrity(corrupt);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("messenger_home_js")));
});
