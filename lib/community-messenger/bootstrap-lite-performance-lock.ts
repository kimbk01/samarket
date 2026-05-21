/**
 * Messenger bootstrap `?lite=1` 성능 회귀 락 — 관측·검증 전용(부트스트랩 동작 변경 없음).
 * @see docs/messenger-bootstrap-lite-performance-lock.md
 */

import baselineJson from "@/lib/community-messenger/bootstrap-lite-performance-lock.baseline.json";

export type BootstrapLitePerfLockSample = {
  total_api_ms: number;
  rooms_query_ms: number;
  parallel_initial_wall_ms: number;
  trade_enrich_ms: number;
  enrich_trade_middle_ms: number;
  enrich_trade_direct_keys_ms?: number;
  profiles_query_ms: number;
  friends_query_ms: number;
  requests_query_ms: number;
  parallel_favorite_ms?: number;
  parallel_discoverable_ms?: number;
  calls_log_rows_fetch_ms?: number;
  payload_kb: number;
  room_count: number;
  rooms_fetch_path: string;
  heavy_pipeline_skipped: boolean;
  trade_enrich_fast_path?: boolean;
  middle_pipeline_blocked?: boolean;
  bootstrap_lite_rooms_cache_bypass?: boolean;
};

export type BootstrapLitePerfLockFailure = {
  code: string;
  message: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
};

export type BootstrapLitePerfLockResult = {
  pass: boolean;
  warm: boolean;
  failures: BootstrapLitePerfLockFailure[];
};

const BASELINE = baselineJson.baseline;
const THRESHOLDS = baselineJson.thresholds;

/** dev/prod 로그·스크립트 공통 고정 기준 */
export const BOOTSTRAP_LITE_PERF_LOCK_RULES = {
  roomsFetchPathRequired: "bundle_rpc",
  warmTotalApiMsMax: THRESHOLDS.warm_total_api_ms_max,
  warmRoomsQueryMsMax: THRESHOLDS.warm_rooms_query_ms_max,
  warmProfilesQueryMsMax: THRESHOLDS.warm_profiles_query_ms_max,
  tradeEnrichMsMax: THRESHOLDS.trade_enrich_ms_max,
  enrichTradeMiddleMsMax: THRESHOLDS.enrich_trade_middle_ms_max,
  payloadKbMax: THRESHOLDS.payload_kb_max,
  socialFetchMsMax: 0,
} as const;

export const BOOTSTRAP_LITE_PERF_BASELINE = BASELINE;

export function isBootstrapLiteWarmLatencySample(sample: BootstrapLitePerfLockSample): boolean {
  return (
    sample.rooms_query_ms > 0 &&
    sample.rooms_query_ms <= THRESHOLDS.warm_rooms_query_ms_max + 40 &&
    sample.total_api_ms <= THRESHOLDS.warm_total_api_ms_max + 120
  );
}

export function evaluateBootstrapLitePerformanceLock(
  sample: BootstrapLitePerfLockSample,
  options?: { warm?: boolean }
): BootstrapLitePerfLockResult {
  const warm = options?.warm ?? isBootstrapLiteWarmLatencySample(sample);
  const failures: BootstrapLitePerfLockFailure[] = [];

  const push = (
    code: string,
    message: string,
    expected: string | number | boolean,
    actual: string | number | boolean
  ) => {
    failures.push({ code, message, expected, actual });
  };

  if (sample.rooms_fetch_path !== BOOTSTRAP_LITE_PERF_LOCK_RULES.roomsFetchPathRequired) {
    push(
      "rooms_fetch_path",
      "lite rooms must use bundle_rpc (not legacy 3RTT or embed)",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.roomsFetchPathRequired,
      sample.rooms_fetch_path
    );
  }

  if (sample.heavy_pipeline_skipped !== true) {
    push(
      "heavy_pipeline_skipped",
      "trade heavy pipeline must stay skipped on lite fast path",
      true,
      sample.heavy_pipeline_skipped
    );
  }

  if (sample.trade_enrich_fast_path === false) {
    push(
      "trade_enrich_fast_path",
      "bootstrap_lite_trade_enrich_fast_path must be true",
      true,
      Boolean(sample.trade_enrich_fast_path)
    );
  }

  if (sample.middle_pipeline_blocked === false) {
    push(
      "middle_pipeline_blocked",
      "bootstrap_lite_middle_pipeline_blocked must be true",
      true,
      Boolean(sample.middle_pipeline_blocked)
    );
  }

  if (sample.trade_enrich_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.tradeEnrichMsMax) {
    push(
      "trade_enrich_ms",
      "trade enrich must stay on lite fast path budget",
      `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.tradeEnrichMsMax}`,
      sample.trade_enrich_ms
    );
  }

  if (sample.enrich_trade_middle_ms !== BOOTSTRAP_LITE_PERF_LOCK_RULES.enrichTradeMiddleMsMax) {
    push(
      "enrich_trade_middle_ms",
      "middle pipeline wall must remain 0 on lite",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.enrichTradeMiddleMsMax,
      sample.enrich_trade_middle_ms
    );
  }

  const socialMs =
    sample.friends_query_ms +
    sample.requests_query_ms +
    (sample.parallel_favorite_ms ?? 0) +
    (sample.parallel_discoverable_ms ?? 0) +
    (sample.calls_log_rows_fetch_ms ?? 0);
  if (socialMs > BOOTSTRAP_LITE_PERF_LOCK_RULES.socialFetchMsMax) {
    push(
      "social_fetch_ms",
      "friends/requests/favorite/discoverable/calllog must not run in lite parallel wall",
      BOOTSTRAP_LITE_PERF_LOCK_RULES.socialFetchMsMax,
      socialMs
    );
  }

  if (sample.payload_kb > BOOTSTRAP_LITE_PERF_LOCK_RULES.payloadKbMax) {
    push(
      "payload_kb",
      "lite payload must stay within first-paint budget",
      `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.payloadKbMax}`,
      sample.payload_kb
    );
  }

  if (sample.room_count < THRESHOLDS.room_count_min) {
    push(
      "room_count",
      "room list must not collapse (shape/regression)",
      `>= ${THRESHOLDS.room_count_min}`,
      sample.room_count
    );
  }

  if (warm) {
    if (sample.total_api_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmTotalApiMsMax) {
      push(
        "warm_total_api_ms",
        "warm lite total_api_ms regression",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmTotalApiMsMax}`,
        sample.total_api_ms
      );
    }
    if (sample.rooms_query_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmRoomsQueryMsMax) {
      push(
        "warm_rooms_query_ms",
        "warm rooms_query_ms regression (bundle_rpc 1RTT)",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmRoomsQueryMsMax}`,
        sample.rooms_query_ms
      );
    }
    if (sample.profiles_query_ms > BOOTSTRAP_LITE_PERF_LOCK_RULES.warmProfilesQueryMsMax) {
      push(
        "warm_profiles_query_ms",
        "warm profiles_query_ms regression (bundle profile_labels + lite first paint)",
        `<= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmProfilesQueryMsMax}`,
        sample.profiles_query_ms
      );
    }
  }

  return { pass: failures.length === 0, warm, failures };
}

export function sampleFromBootstrapDiagnostics(params: {
  diagnostics: {
    parallelAcceptedFriendsBundleMs: number;
    parallelFavoriteFriendsMs: number;
    parallelFriendRequestsMs: number;
    parallelDiscoverableFetchMs: number;
    callsLogRowsFetchMs: number;
    roomsQueryMs: number;
    profilesMs: number;
    parallelInitialWallMs: number;
    tradeContextMs: number;
    enrichTradeMiddlePipelineMs: number;
    bootstrapLiteTradeEnrichFastPath: boolean;
    bootstrapLiteTradeHeavyPipelineSkipped: boolean;
    bootstrapLiteMiddlePipelineBlocked: boolean;
    bootstrapLiteRoomsFetchPath: string;
    bootstrapLiteRoomsCacheBypass: boolean;
    roomCount: number;
  };
  routeTotalMs: number;
  payloadKb: number;
}): BootstrapLitePerfLockSample {
  const d = params.diagnostics;
  return {
    total_api_ms: params.routeTotalMs,
    rooms_query_ms: d.roomsQueryMs,
    profiles_query_ms: d.profilesMs,
    parallel_initial_wall_ms: d.parallelInitialWallMs,
    trade_enrich_ms: d.tradeContextMs,
    enrich_trade_middle_ms: d.enrichTradeMiddlePipelineMs,
    friends_query_ms: d.parallelAcceptedFriendsBundleMs + d.parallelFavoriteFriendsMs,
    requests_query_ms: d.parallelFriendRequestsMs,
    parallel_favorite_ms: d.parallelFavoriteFriendsMs,
    parallel_discoverable_ms: d.parallelDiscoverableFetchMs,
    calls_log_rows_fetch_ms: d.callsLogRowsFetchMs,
    payload_kb: params.payloadKb,
    room_count: d.roomCount,
    rooms_fetch_path: d.bootstrapLiteRoomsFetchPath,
    heavy_pipeline_skipped: d.bootstrapLiteTradeHeavyPipelineSkipped,
    trade_enrich_fast_path: d.bootstrapLiteTradeEnrichFastPath,
    middle_pipeline_blocked: d.bootstrapLiteMiddlePipelineBlocked,
    bootstrap_lite_rooms_cache_bypass: d.bootstrapLiteRoomsCacheBypass,
  };
}

let lastWarnKey = "";

/** dev: 기준 초과 시 요청당 `console.warn` 1회 (동일 요청 중복 방지 키) */
export function warnBootstrapLitePerformanceLockIfNeeded(params: {
  sample: BootstrapLitePerfLockSample;
  requestKey?: string;
}): BootstrapLitePerfLockResult {
  if (process.env.NODE_ENV !== "development") {
    return evaluateBootstrapLitePerformanceLock(params.sample);
  }
  const result = evaluateBootstrapLitePerformanceLock(params.sample);
  if (result.pass) return result;

  const key = params.requestKey ?? `${params.sample.total_api_ms}:${params.sample.rooms_fetch_path}`;
  if (lastWarnKey === key) return result;
  lastWarnKey = key;

  const codes = result.failures.map((f) => f.code).join(",");
  // eslint-disable-next-line no-console -- dev regression guard
  console.warn(
    "[cm-bootstrap-lite-perf-lock]",
    JSON.stringify({
      pass: false,
      warm: result.warm,
      regression_codes: codes,
      failures: result.failures,
      hint: "See docs/messenger-bootstrap-lite-performance-lock.md — do not revert bundle_rpc / social defer / trade fast path.",
    })
  );
  return result;
}
