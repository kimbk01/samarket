/**
 * Mirror of lib/community-messenger/bootstrap-lite-performance-lock.ts for Node scripts.
 * Keep in sync with baseline JSON + TS evaluator.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(
  root,
  "lib/community-messenger/bootstrap-lite-performance-lock.baseline.json"
);
const { baseline: BASELINE, thresholds: THRESHOLDS } = JSON.parse(
  fs.readFileSync(baselinePath, "utf8")
);

export const BOOTSTRAP_LITE_PERF_LOCK_RULES = {
  roomsFetchPathRequired: "bundle_rpc",
  warmTotalApiMsMax: THRESHOLDS.warm_total_api_ms_max,
  warmRoomsQueryMsMax: THRESHOLDS.warm_rooms_query_ms_max,
  warmProfilesQueryMsMax: THRESHOLDS.warm_profiles_query_ms_max,
  tradeEnrichMsMax: THRESHOLDS.trade_enrich_ms_max,
  enrichTradeMiddleMsMax: THRESHOLDS.enrich_trade_middle_ms_max,
  payloadKbMax: THRESHOLDS.payload_kb_max,
  socialFetchMsMax: 0,
};

export function isBootstrapLiteWarmLatencySample(sample) {
  return (
    sample.rooms_query_ms > 0 &&
    sample.rooms_query_ms <= THRESHOLDS.warm_rooms_query_ms_max + 40 &&
    sample.total_api_ms <= THRESHOLDS.warm_total_api_ms_max + 120
  );
}

export function evaluateBootstrapLitePerformanceLock(sample, options = {}) {
  const warm = options.warm ?? isBootstrapLiteWarmLatencySample(sample);
  const failures = [];
  const push = (code, message, expected, actual) => {
    failures.push({ code, message, expected, actual });
  };

  if (sample.rooms_fetch_path !== BOOTSTRAP_LITE_PERF_LOCK_RULES.roomsFetchPathRequired) {
    push(
      "rooms_fetch_path",
      "lite rooms must use bundle_rpc — deploy migration or revert guard",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.roomsFetchPathRequired,
      sample.rooms_fetch_path
    );
  }
  if (sample.heavy_pipeline_skipped !== true) {
    push("heavy_pipeline_skipped", "trade heavy pipeline must stay skipped on lite", true, sample.heavy_pipeline_skipped);
  }
  if (sample.trade_enrich_fast_path === false) {
    push("trade_enrich_fast_path", "bootstrap_lite_trade_enrich_fast_path must be true", true, false);
  }
  if (sample.middle_pipeline_blocked === false) {
    push("middle_pipeline_blocked", "bootstrap_lite_middle_pipeline_blocked must be true", true, false);
  }
  if (sample.trade_enrich_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.tradeEnrichMsMax) {
    push(
      "trade_enrich_ms",
      "trade enrich over lite budget — check fast path / mega prefetch",
      `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.tradeEnrichMsMax}`,
      sample.trade_enrich_ms
    );
  }
  if (sample.enrich_trade_middle_ms !== BOOTSTRAP_LITE_PERF_LOCK_RULES.enrichTradeMiddleMsMax) {
    push(
      "enrich_trade_middle_ms",
      "middle pipeline must not run on lite",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.enrichTradeMiddleMsMax,
      sample.enrich_trade_middle_ms
    );
  }
  const socialMs =
    (sample.friends_query_ms ?? 0) +
    (sample.requests_query_ms ?? 0) +
    (sample.parallel_discoverable_ms ?? 0) +
    (sample.calls_log_rows_fetch_ms ?? 0);
  if (socialMs > BOOTSTRAP_LITE_PERF_LOCK_RULES.socialFetchMsMax) {
    push(
      "social_fetch_ms",
      "social graph / call log must stay deferred on lite",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.socialFetchMsMax,
      socialMs
    );
  }
  if (sample.payload_kb > BOOTSTRAP_LITE_PERF_LOCK_RULES.payloadKbMax) {
    push("payload_kb", "lite payload too large", `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.payloadKbMax}`, sample.payload_kb);
  }
  if (sample.room_count < THRESHOLDS.room_count_min) {
    push("room_count", "room list collapsed", `>= ${THRESHOLDS.room_count_min}`, sample.room_count);
  }
  if (warm) {
    if (sample.total_api_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmTotalApiMsMax) {
      push(
        "warm_total_api_ms",
        "warm total_api_ms regression",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmTotalApiMsMax}`,
        sample.total_api_ms
      );
    }
    if (sample.rooms_query_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmRoomsQueryMsMax) {
      push(
        "warm_rooms_query_ms",
        "warm rooms_query_ms regression",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmRoomsQueryMsMax}`,
        sample.rooms_query_ms
      );
    }
    if ((sample.profiles_query_ms ?? 0) > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmProfilesQueryMsMax) {
      push(
        "warm_profiles_query_ms",
        "warm profiles_query_ms regression",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmProfilesQueryMsMax}`,
        sample.profiles_query_ms ?? 0
      );
    }
  }

  return { pass: failures.length === 0, warm, failures };
}

export function logFromCmBootstrapV2(log, breakdown = {}) {
  return {
    total_api_ms: log.total_api_ms,
    rooms_query_ms: log.rooms_query_ms,
    profiles_query_ms: log.profiles_query_ms ?? 0,
    parallel_initial_wall_ms: log.parallel_initial_wall_ms,
    trade_enrich_ms: log.trade_enrich_ms,
    enrich_trade_middle_ms: breakdown.enrich_trade_middle_ms ?? 0,
    friends_query_ms: log.friends_query_ms ?? 0,
    requests_query_ms: log.requests_query_ms ?? 0,
    parallel_discoverable_ms: breakdown.parallel_discoverable_ms ?? log.bootstrap_lite_discoverable_fetch_ms ?? 0,
    calls_log_rows_fetch_ms: breakdown.calls_log_rows_fetch_ms ?? 0,
    payload_kb: log.payload_kb,
    room_count: log.room_count,
    rooms_fetch_path: log.bootstrap_lite_rooms_fetch_path ?? "unknown",
    heavy_pipeline_skipped: log.bootstrap_lite_trade_heavy_pipeline_skipped === true,
    trade_enrich_fast_path: log.bootstrap_lite_trade_enrich_fast_path === true,
    middle_pipeline_blocked: log.bootstrap_lite_middle_pipeline_blocked === true,
  };
}

export { BASELINE, THRESHOLDS };
