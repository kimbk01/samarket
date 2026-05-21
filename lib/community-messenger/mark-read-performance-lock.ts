/**
 * PATCH `mark_read` (flushOpen cold + warm duplicate) — 구조 회귀 락. RTT 한계와 분리.
 * @see docs/messenger-mark-read-performance-lock.md
 */

import baselineJson from "@/lib/community-messenger/mark-read-performance-lock.baseline.json";

export type MarkReadPerfEnvironment = "local_linked" | "prod_same_region";

export type MarkReadPerfLockSample = {
  /** 검증 스크립트 시나리오 라벨 */
  scenario?: "A" | "B" | "C" | "D";
  perf_environment?: MarkReadPerfEnvironment;
  permission_query_ms: number;
  membership_cache_hit: 0 | 1;
  permission_source?: string;
  permission_cache_reason?: string;
  mark_read_combined_rpc_used?: 0 | 1;
  mark_read_fetch_existing_ms?: number;
  mark_read_db_round_trips?: number;
  mark_read_combined_rpc_ms?: number;
  patch_room_response_wall_ms?: number;
  response_before_broadcast?: 0 | 1;
  patch_room_inflight_dedupe_hit?: 0 | 1;
  patch_room_duplicate_ack_skipped?: 0 | 1;
  mark_read_cold_open_path?: 0 | 1;
  /** bootstrap 또는 room GET 직후 — membership seed 기대 */
  expect_seeded_permission?: boolean;
  /** cold unread open — combined RPC 기대 */
  expect_cold_combined_open?: boolean;
};

export type MarkReadPerfLockFailure = {
  code: string;
  message: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
  severity: "fail" | "warn";
};

export type MarkReadPerfLockResult = {
  pass: boolean;
  structure_pass: boolean;
  failures: MarkReadPerfLockFailure[];
  warnings: MarkReadPerfLockFailure[];
};

const THRESHOLDS = baselineJson.thresholds;

export const MARK_READ_PERF_LOCK_RULES = {
  /** permission path — `messenger-room-canonical-resolve-core` only; no `service.ts` dynamic import */
  permissionResolverModule: "messenger-room-canonical-resolve-core",
  membershipCacheGlobalKey: "__samarket_cm_room_membership_cache_v1__",
  coldDbRoundTripsMax: 1,
  coldFetchExistingMsMax: 0,
  coldCombinedRpcRequired: 1,
  responseBeforeBroadcastRequired: 1,
  ...THRESHOLDS.local_linked,
  prod: THRESHOLDS.prod_same_region,
} as const;

export const MARK_READ_STRUCTURE_BASELINE = baselineJson.structure_pass;

function envOf(sample: MarkReadPerfLockSample): MarkReadPerfEnvironment {
  if (sample.perf_environment === "prod_same_region") return "prod_same_region";
  if (process.env.SAMARKET_PERF_ENV === "prod_same_region") return "prod_same_region";
  return "local_linked";
}

/** 정적 회귀: permission API 가 service.ts 를 dynamic import 하면 FAIL */
export function assertMarkReadPermissionPathNoServiceDynamicImport(source: string): MarkReadPerfLockFailure | null {
  const codeLines = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .join("\n");
  if (/import\s*\(\s*["']@\/lib\/community-messenger\/service["']\s*\)/.test(codeLines)) {
    return {
      code: "permission_service_dynamic_import",
      message: "permission path must not dynamic-import service.ts (use canonical-resolve-core)",
      expected: "no dynamic import",
      actual: "found import(@/lib/community-messenger/service)",
      severity: "fail",
    };
  }
  return null;
}

export function evaluateMarkReadPerformanceLock(sample: MarkReadPerfLockSample): MarkReadPerfLockResult {
  const failures: MarkReadPerfLockFailure[] = [];
  const warnings: MarkReadPerfLockFailure[] = [];
  const pushFail = (
    code: string,
    message: string,
    expected: string | number | boolean,
    actual: string | number | boolean
  ) => {
    failures.push({ code, message, expected, actual, severity: "fail" });
  };
  const pushWarn = (
    code: string,
    message: string,
    expected: string | number | boolean,
    actual: string | number | boolean
  ) => {
    warnings.push({ code, message, expected, actual, severity: "warn" });
  };

  const perfEnv = envOf(sample);
  const localT = THRESHOLDS.local_linked;
  const prodT = THRESHOLDS.prod_same_region;

  if (sample.expect_seeded_permission) {
    if (sample.membership_cache_hit !== 1) {
      pushFail(
        "membership_cache_miss_after_seed",
        "bootstrap/GET 후 PATCH permission cache miss",
        1,
        sample.membership_cache_hit ?? 0
      );
    }
    if (sample.permission_query_ms > localT.permission_query_ms_seeded_max) {
      pushFail(
        "permission_query_ms_seeded",
        "seeded permission must stay near 0",
        `<= ${localT.permission_query_ms_seeded_max}`,
        sample.permission_query_ms
      );
    }
    if (sample.permission_source && sample.permission_source !== "membership_cache") {
      pushFail(
        "permission_source_seeded",
        "seeded route should hit membership_cache",
        "membership_cache",
        sample.permission_source
      );
    }
  }

  const coldOpen =
    sample.expect_cold_combined_open === true ||
    (sample.mark_read_cold_open_path === 1 && sample.patch_room_duplicate_ack_skipped !== 1);

  if (coldOpen) {
    if ((sample.mark_read_db_round_trips ?? 0) > MARK_READ_PERF_LOCK_RULES.coldDbRoundTripsMax) {
      pushFail("db_round_trips", "cold open must be single DB round trip", 1, sample.mark_read_db_round_trips ?? 0);
    }
    if ((sample.mark_read_fetch_existing_ms ?? 0) > MARK_READ_PERF_LOCK_RULES.coldFetchExistingMsMax) {
      pushFail(
        "fetch_existing_ms",
        "cold open must not SELECT participant before RPC",
        0,
        sample.mark_read_fetch_existing_ms ?? 0
      );
    }
    if (sample.mark_read_combined_rpc_used !== 1) {
      pushFail(
        "combined_rpc_used",
        "cold unread open must use combined RPC",
        1,
        sample.mark_read_combined_rpc_used ?? 0
      );
    }
  }

  if (sample.response_before_broadcast !== undefined && sample.response_before_broadcast !== 1) {
    pushFail(
      "response_before_broadcast",
      "broadcast must run after HTTP response (after())",
      1,
      sample.response_before_broadcast
    );
  }

  /** Warm wall budget — C/D only (A/B cold open uses RTT warn, not warm fail). */
  const warmScenario = sample.scenario === "C" || sample.scenario === "D";

  if (warmScenario) {
    const wall = sample.patch_room_response_wall_ms ?? 0;
    const warmFailMs =
      perfEnv === "prod_same_region"
        ? prodT.warm_duplicate_wall_ms_fail
        : localT.warm_duplicate_wall_ms_fail;
    const warmPassMs =
      perfEnv === "prod_same_region"
        ? prodT.warm_duplicate_wall_ms_pass
        : localT.warm_duplicate_wall_ms_pass;
    if (wall > warmFailMs) {
      pushFail(
        "warm_duplicate_wall_ms",
        "warm duplicate / dual-tab wall too high (structure regression)",
        `<= ${warmFailMs}`,
        wall
      );
    } else if (wall > warmPassMs) {
      pushWarn(
        "warm_duplicate_wall_ms",
        "warm path slower than target",
        `<= ${warmPassMs}`,
        wall
      );
    }
  }

  if (sample.scenario === "D" && sample.patch_room_inflight_dedupe_hit !== 1) {
    const wall = sample.patch_room_response_wall_ms ?? 999;
    const warmPassMs =
      perfEnv === "prod_same_region"
        ? prodT.warm_duplicate_wall_ms_pass
        : localT.warm_duplicate_wall_ms_pass;
    if (wall > warmPassMs) {
      pushFail(
        "dual_tab_inflight_dedupe",
        "parallel PATCH should dedupe or complete under warm budget",
        "inflight_dedupe_hit=1 or wall<=50",
        `dedupe=${sample.patch_room_inflight_dedupe_hit} wall=${wall}`
      );
    }
  }

  if (perfEnv === "local_linked" && coldOpen) {
    const rpcMs = sample.mark_read_combined_rpc_ms ?? 0;
    if (rpcMs > localT.cold_combined_rpc_ms_warn) {
      pushWarn(
        "mark_read_combined_rpc_rtt",
        "local_linked combined RPC over RTT warn band — measure prod_same_region",
        `<= ${localT.cold_combined_rpc_ms_warn} (warn only)`,
        rpcMs
      );
    }
    const wall = sample.patch_room_response_wall_ms ?? 0;
    if (wall > localT.cold_route_wall_ms_warn) {
      pushWarn(
        "patch_room_response_wall_rtt",
        "route wall RTT-limited on local_linked",
        `<= ${localT.cold_route_wall_ms_warn}`,
        wall
      );
    }
  }

  if (perfEnv === "prod_same_region") {
    if (sample.permission_query_ms > prodT.permission_query_ms_max) {
      pushFail(
        "permission_query_ms_prod",
        "prod_same_region permission budget",
        `<= ${prodT.permission_query_ms_max}`,
        sample.permission_query_ms
      );
    }
    if (coldOpen) {
      const wall = sample.patch_room_response_wall_ms ?? 0;
      if (wall > prodT.cold_open_wall_ms_hard) {
        pushFail(
          "cold_open_wall_ms_prod",
          "prod cold open hard max",
          `<= ${prodT.cold_open_wall_ms_hard}`,
          wall
        );
      } else if (wall > prodT.cold_open_wall_ms_target) {
        pushWarn(
          "cold_open_wall_ms_prod",
          "prod cold open above target",
          `<= ${prodT.cold_open_wall_ms_target}`,
          wall
        );
      }
    }
  }

  const structure_pass = failures.length === 0;
  return {
    pass: structure_pass,
    structure_pass,
    failures,
    warnings,
  };
}

let lastWarnKey = "";

/** dev: 구조 FAIL 또는 RTT WARN 시 요청당 `console.warn` 1회 */
export function warnMarkReadPerformanceLockIfNeeded(params: {
  sample: MarkReadPerfLockSample;
  requestKey?: string;
}): MarkReadPerfLockResult {
  const result = evaluateMarkReadPerformanceLock(params.sample);
  if (process.env.NODE_ENV !== "development") return result;

  const hasFail = result.failures.length > 0;
  const hasRttWarn = result.warnings.some((w) => w.code.startsWith("mark_read_combined_rpc") || w.code.startsWith("patch_room_response_wall_rtt"));
  if (!hasFail && !hasRttWarn) return result;

  const key =
    params.requestKey ??
    `${params.sample.scenario ?? "route"}:${params.sample.mark_read_combined_rpc_used}:${params.sample.membership_cache_hit}:${result.failures.map((f) => f.code).join(",")}`;
  if (lastWarnKey === key) return result;
  lastWarnKey = key;

  const payload = {
    pass: result.pass,
    structure_pass: result.structure_pass,
    perf_environment: envOf(params.sample),
    regression_codes: [...result.failures, ...result.warnings].map((f) => f.code).join(","),
    failures: result.failures,
    warnings: result.warnings,
    hint: hasFail
      ? "See docs/messenger-mark-read-performance-lock.md — structure regression (not RTT)."
      : "RTT-limited on local_linked — re-measure with SAMARKET_PERF_ENV=prod_same_region.",
  };
  // eslint-disable-next-line no-console -- dev regression guard
  console.warn("[cm-mark-read-perf-lock]", JSON.stringify(payload));
  return result;
}
