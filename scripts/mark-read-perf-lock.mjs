/**
 * Mirror of lib/community-messenger/mark-read-performance-lock.ts for Node scripts.
 * @see docs/messenger-mark-read-performance-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "lib/community-messenger/mark-read-performance-lock.baseline.json");
const { thresholds: THRESHOLDS, structure_pass: STRUCTURE_BASELINE } = JSON.parse(
  fs.readFileSync(baselinePath, "utf8")
);

export const MARK_READ_PERF_LOCK_RULES = {
  coldDbRoundTripsMax: 1,
  coldFetchExistingMsMax: 0,
  coldCombinedRpcRequired: 1,
  responseBeforeBroadcastRequired: 1,
  ...THRESHOLDS.local_linked,
  prod: THRESHOLDS.prod_same_region,
};

export function assertMarkReadPermissionPathNoServiceDynamicImport(source) {
  const codeLines = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .join("\n");
  if (/import\s*\(\s*["']@\/lib\/community-messenger\/service["']\s*\)/.test(codeLines)) {
    return {
      code: "permission_service_dynamic_import",
      message: "permission path must not dynamic-import service.ts",
      expected: "no dynamic import",
      actual: "found import(@/lib/community-messenger/service)",
      severity: "fail",
    };
  }
  return null;
}

function envOf(sample) {
  if (sample.perf_environment === "prod_same_region") return "prod_same_region";
  if (process.env.SAMARKET_PERF_ENV === "prod_same_region") return "prod_same_region";
  return "local_linked";
}

export function evaluateMarkReadPerformanceLock(sample) {
  const failures = [];
  const warnings = [];
  const pushFail = (code, message, expected, actual) => {
    failures.push({ code, message, expected, actual, severity: "fail" });
  };
  const pushWarn = (code, message, expected, actual) => {
    warnings.push({ code, message, expected, actual, severity: "warn" });
  };

  const perfEnv = envOf(sample);
  const t = perfEnv === "prod_same_region" ? THRESHOLDS.prod_same_region : THRESHOLDS.local_linked;

  if (sample.expect_seeded_permission) {
    if (sample.membership_cache_hit !== 1) {
      pushFail("membership_cache_miss_after_seed", "bootstrap/GET 후 cache miss", 1, sample.membership_cache_hit ?? 0);
    }
    if (sample.permission_query_ms > t.permission_query_ms_seeded_max) {
      pushFail("permission_query_ms_seeded", "seeded permission budget", `<= ${t.permission_query_ms_seeded_max}`, sample.permission_query_ms);
    }
    if (sample.permission_source && sample.permission_source !== "membership_cache") {
      pushFail("permission_source_seeded", "seeded permission_source", "membership_cache", sample.permission_source);
    }
  }

  const coldOpen =
    sample.expect_cold_combined_open === true ||
    (sample.mark_read_cold_open_path === 1 && sample.patch_room_duplicate_ack_skipped !== 1);

  if (coldOpen) {
    if ((sample.mark_read_db_round_trips ?? 0) > 1) {
      pushFail("db_round_trips", "cold open single RTT", 1, sample.mark_read_db_round_trips ?? 0);
    }
    if ((sample.mark_read_fetch_existing_ms ?? 0) > 0) {
      pushFail("fetch_existing_ms", "no pre-RPC participant SELECT", 0, sample.mark_read_fetch_existing_ms ?? 0);
    }
    if (sample.mark_read_combined_rpc_used !== 1) {
      pushFail("combined_rpc_used", "cold open combined RPC", 1, sample.mark_read_combined_rpc_used ?? 0);
    }
  }

  if (sample.response_before_broadcast !== undefined && sample.response_before_broadcast !== 1) {
    pushFail("response_before_broadcast", "broadcast after response", 1, sample.response_before_broadcast);
  }

  const warmScenario = sample.scenario === "C" || sample.scenario === "D";

  if (warmScenario) {
    const wall = sample.patch_room_response_wall_ms ?? 0;
    if (wall > t.warm_duplicate_wall_ms_fail) {
      pushFail("warm_duplicate_wall_ms", "warm/dedupe wall fail", `<= ${t.warm_duplicate_wall_ms_fail}`, wall);
    } else if (wall > t.warm_duplicate_wall_ms_pass) {
      pushWarn("warm_duplicate_wall_ms", "warm slower than target", `<= ${t.warm_duplicate_wall_ms_pass}`, wall);
    }
  }

  if (sample.scenario === "D" && sample.patch_room_inflight_dedupe_hit !== 1) {
    const wall = sample.patch_room_response_wall_ms ?? 999;
    if (wall > t.warm_duplicate_wall_ms_pass) {
      pushFail("dual_tab_inflight_dedupe", "dual-tab dedupe or fast second tab", "dedupe=1 or wall<=50", `dedupe=${sample.patch_room_inflight_dedupe_hit} wall=${wall}`);
    }
  }

  if (perfEnv === "local_linked" && coldOpen) {
    const rpcMs = sample.mark_read_combined_rpc_ms ?? 0;
    if (rpcMs > t.cold_combined_rpc_ms_warn) {
      pushWarn("mark_read_combined_rpc_rtt", "linked DB RTT — prod_same_region 재측정", `<= ${t.cold_combined_rpc_ms_warn} warn`, rpcMs);
    }
  }

  if (perfEnv === "prod_same_region") {
    if (sample.permission_query_ms > t.permission_query_ms_max) {
      pushFail("permission_query_ms_prod", "prod permission", `<= ${t.permission_query_ms_max}`, sample.permission_query_ms);
    }
    if (coldOpen) {
      const wall = sample.patch_room_response_wall_ms ?? 0;
      if (wall > t.cold_open_wall_ms_hard) {
        pushFail("cold_open_wall_ms_prod", "prod cold wall hard", `<= ${t.cold_open_wall_ms_hard}`, wall);
      } else if (wall > t.cold_open_wall_ms_target) {
        pushWarn("cold_open_wall_ms_prod", "prod cold above target", `<= ${t.cold_open_wall_ms_target}`, wall);
      }
    }
  }

  return {
    pass: failures.length === 0,
    structure_pass: failures.length === 0,
    failures,
    warnings,
    structure_baseline: STRUCTURE_BASELINE,
  };
}

export function sampleFromDevApiPerf(p, scenario, options = {}) {
  return {
    scenario,
    perf_environment: options.perf_environment,
    permission_query_ms: Number(p.permission_query_ms ?? 0),
    membership_cache_hit: p.membership_cache_hit === 1 ? 1 : 0,
    permission_source: p.permission_source,
    permission_cache_reason: p.permission_cache_reason,
    mark_read_combined_rpc_used: p.mark_read_combined_rpc_used === 1 ? 1 : 0,
    mark_read_fetch_existing_ms: Number(p.mark_read_fetch_existing_ms ?? 0),
    mark_read_db_round_trips: Number(p.mark_read_db_round_trips ?? 0),
    mark_read_combined_rpc_ms: Number(p.mark_read_combined_rpc_ms ?? 0),
    patch_room_response_wall_ms: Number(p.patch_room_response_wall_ms ?? p.total_route_ms ?? 0),
    response_before_broadcast: p.response_before_broadcast === 1 ? 1 : 0,
    patch_room_inflight_dedupe_hit: p.patch_room_inflight_dedupe_hit === 1 ? 1 : 0,
    patch_room_duplicate_ack_skipped: p.patch_room_duplicate_ack_skipped === 1 ? 1 : 0,
    mark_read_cold_open_path: p.mark_read_cold_open_path === 1 ? 1 : 0,
    expect_seeded_permission: options.expect_seeded_permission ?? false,
    expect_cold_combined_open: options.expect_cold_combined_open ?? false,
  };
}
