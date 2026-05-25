/**
 * Owner dashboard API — 구조 락 vs env별 latency SLO (docs/owner-dashboard-api-perf-lock.md).
 * @typedef {'local_linked' | 'prod_same_region' | 'unknown'} EnvironmentMode
 */

/** @type {Record<EnvironmentMode, { order_counts_cold_max: number; order_counts_cold_warn_min: number | null; order_counts_warm_max: number; hub_warm_max: number; notifications_warm_max: number }>} */
export const LATENCY_SLO = {
  local_linked: {
    order_counts_cold_max: 350,
    order_counts_cold_warn_min: 250,
    order_counts_warm_max: 30,
    hub_warm_max: 30,
    notifications_warm_max: 30,
  },
  prod_same_region: {
    order_counts_cold_max: 250,
    order_counts_cold_warn_min: null,
    order_counts_warm_max: 20,
    hub_warm_max: 20,
    notifications_warm_max: 20,
  },
  unknown: {
    order_counts_cold_max: 350,
    order_counts_cold_warn_min: 250,
    order_counts_warm_max: 30,
    hub_warm_max: 30,
    notifications_warm_max: 30,
  },
};

export const RPC_SERVER_SQL_MAX_MS = 20;

/**
 * @param {{ baseUrl?: string }} [opts]
 * @returns {EnvironmentMode}
 */
export function detectEnvironmentMode(opts = {}) {
  const forced = process.env.OWNER_DASHBOARD_PERF_ENV?.trim();
  if (forced === "local_linked" || forced === "prod_same_region") return forced;
  if (
    process.env.VERCEL === "1" ||
    process.env.SAMARKET_OWNER_DASHBOARD_PROD === "1" ||
    process.env.SAMARKET_DEPLOYMENT_SAME_REGION === "1"
  ) {
    return "prod_same_region";
  }
  const base = (opts.baseUrl ?? process.env.SAMARKET_BASE_URL ?? "http://127.0.0.1:3000").toLowerCase();
  if (base.includes("127.0.0.1") || base.includes("localhost")) return "local_linked";
  return "unknown";
}

/**
 * @param {string} text
 * @param {string} tag e.g. owner-dashboard-perf-v2
 */
export function parseTaggedJsonBlocks(text, tag) {
  const rows = [];
  const lineRe = new RegExp(`\\[${tag}\\]\\s*(\\{.+\\})`, "g");
  let lm;
  while ((lm = lineRe.exec(text)) !== null) {
    try {
      rows.push(JSON.parse(lm[1]));
      continue;
    } catch {
      /* legacy inspect format */
    }
  }
  const re = new RegExp(`\\[${tag}\\]\\s*\\{`, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    try {
      const chunk = text.slice(start, end).replace(/:\s*undefined\b/g, ": null");
      const row = JSON.parse(chunk);
      if (!rows.some((r) => r.route === row.route && r.total_ms === row.total_ms && r.cache_hit === row.cache_hit)) {
        rows.push(row);
      }
    } catch {
      /* */
    }
  }
  return rows;
}

function routeRows(blocks, suffix) {
  return blocks.filter((r) => String(r.route ?? "").includes(suffix));
}

function avgMs(rows, key = "total_ms") {
  if (!rows.length) return -1;
  return Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length);
}

/**
 * @param {object[]} perfV2
 * @param {object[]} coldBreakdowns
 * @param {number | null} rpcServerSqlMs
 */
export function evaluateOrderCountsStructural(perfV2, coldBreakdowns, rpcServerSqlMs) {
  const fails = [];
  const cold = routeRows(perfV2, "order-counts").filter((r) => r.cache_hit !== 1);
  const warm = routeRows(perfV2, "order-counts").filter((r) => r.cache_hit === 1);

  if (!cold.length) {
    fails.push("no_cold_order_counts_perf_v2_sample (npm run dev + measure; logs in terminals dir)");
  }

  for (const r of cold) {
    if (r.fallback_used === 1) fails.push("legacy_fallback_used");
    if (r.order_counts_via != null && r.order_counts_via !== "delivery_summary_snapshot") {
      fails.push(`order_counts_via=${r.order_counts_via}`);
    }
    if (typeof r.db_round_trips === "number" && r.db_round_trips > 1) {
      fails.push(`db_round_trips=${r.db_round_trips}`);
    }
  }

  for (const b of coldBreakdowns) {
    if ((b.ownership_check_ms ?? 0) > 0) fails.push(`ownership_check_ms=${b.ownership_check_ms}`);
    if ((b.store_ops_meta_ms ?? 0) > 0) fails.push(`store_ops_meta_ms=${b.store_ops_meta_ms}`);
    if (b.order_counts_via && b.order_counts_via !== "delivery_summary_snapshot") {
      fails.push(`breakdown_via=${b.order_counts_via}`);
    }
  }

  if (warm.length >= 2 && warm.every((r) => r.cache_hit !== 1)) {
    fails.push("warm_cache_miss_repeated");
  }

  if (rpcServerSqlMs != null && rpcServerSqlMs > RPC_SERVER_SQL_MAX_MS) {
    fails.push(`rpc_server_sql_ms=${rpcServerSqlMs}`);
  }

  return { pass: fails.length === 0, fails, cold, warm };
}

/**
 * @param {object[]} perfV2
 * @param {object[]} hubBreakdowns
 * @param {{ requireNoHub?: boolean }} [opts]
 */
export function evaluateHubBadgeStructural(perfV2, hubBreakdowns, opts = {}) {
  const fails = [];
  const rows = routeRows(perfV2, "store-owner-hub-badge");
  const warm = rows.filter((r) => r.cache_hit === 1);
  const noHubPerf = rows.filter((r) => r.no_hub_fast_path === 1);
  const noHubBd = hubBreakdowns.filter(
    (b) => b.no_hub_fast_path === 1 || b.unread_parts_via === "skipped_no_hub"
  );

  if (opts.requireNoHub && noHubPerf.length === 0 && noHubBd.length === 0) {
    fails.push(
      "no_hub_fast_path_sample_missing (set OWNER_DASHBOARD_GATE_NO_HUB=1 and login without hub store)"
    );
  }

  for (const b of noHubBd) {
    if (b.no_hub_fast_path !== 1 && b.unread_parts_via !== "skipped_no_hub") {
      fails.push("no_hub_fast_path_not_set");
    }
    if ((b.unread_parts_ms ?? 0) > 0) fails.push(`no_hub_unread_parts_ms=${b.unread_parts_ms}`);
    if (b.unread_parts_via && b.unread_parts_via !== "skipped_no_hub") {
      fails.push(`no_hub_unread_parts_via=${b.unread_parts_via}`);
    }
  }

  for (const r of noHubPerf.filter((x) => x.cache_hit === 1)) {
    if (r.total_ms > 30) fails.push(`no_hub_hub_warm_total=${r.total_ms}`);
  }

  return { pass: fails.length === 0, fails, warm, noHubRows: noHubPerf };
}

/** @param {object[]} perfV2 */
export function evaluateNotificationsStructural(perfV2) {
  const fails = [];
  const warm = routeRows(perfV2, "notifications").filter((r) => r.cache_hit === 1);
  if (warm.length >= 2 && warm.every((r) => r.cache_hit !== 1)) {
    fails.push("notifications_warm_cache_miss_repeated");
  }
  for (const r of warm) {
    const dbMs = r.notification_count_ms ?? 0;
    if (dbMs > 0) fails.push(`notifications_warm_db_ms=${dbMs}`);
  }
  return { pass: fails.length === 0, fails, warm };
}

/**
 * @param {EnvironmentMode} mode
 * @param {object} samples
 */
export function evaluateLatencyPass(mode, samples) {
  const slo = LATENCY_SLO[mode] ?? LATENCY_SLO.unknown;
  const fails = [];
  const warns = [];

  const ocCold = samples.order_counts_cold_avg;
  const ocWarm = samples.order_counts_warm_avg;
  const hubWarm = samples.hub_warm_avg;
  const notifWarm = samples.notifications_warm_avg;

  if (ocCold < 0 && ocWarm < 0) {
    fails.push("insufficient_server_perf_v2_samples");
    return { pass: false, fails, warns, slo };
  }

  if (ocCold >= 0 && ocCold > slo.order_counts_cold_max) {
    fails.push(`order_counts_cold_avg=${ocCold}ms > ${slo.order_counts_cold_max}ms`);
  } else if (
    slo.order_counts_cold_warn_min != null &&
    ocCold >= 0 &&
    ocCold > slo.order_counts_cold_warn_min &&
    ocCold <= slo.order_counts_cold_max
  ) {
    warns.push(`order_counts_cold_avg=${ocCold}ms (RTT band ${slo.order_counts_cold_warn_min}–${slo.order_counts_cold_max}ms)`);
  }

  if (ocWarm >= 0 && ocWarm > slo.order_counts_warm_max) {
    fails.push(`order_counts_warm_avg=${ocWarm}ms > ${slo.order_counts_warm_max}ms`);
  }
  if (hubWarm >= 0 && hubWarm > slo.hub_warm_max) {
    fails.push(`hub_badge_warm_avg=${hubWarm}ms > ${slo.hub_warm_max}ms`);
  }
  if (notifWarm >= 0 && notifWarm > slo.notifications_warm_max) {
    fails.push(`notifications_warm_avg=${notifWarm}ms > ${slo.notifications_warm_max}ms`);
  }

  if (mode === "prod_same_region" && ocCold >= 0 && ocCold > 250) {
    fails.push(`prod_order_counts_cold=${ocCold}ms > 250ms`);
  }

  return { pass: fails.length === 0, fails, warns, slo };
}

/**
 * @param {boolean} structuralPass
 * @param {boolean} latencyPass
 * @param {EnvironmentMode} mode
 * @param {number} orderCountsColdAvg
 * @param {string[]} latencyWarns
 */
export function deriveRttLimited(structuralPass, latencyPass, mode, orderCountsColdAvg, latencyWarns) {
  const slo = LATENCY_SLO[mode] ?? LATENCY_SLO.unknown;
  if (!structuralPass || orderCountsColdAvg < 0) {
    return { rtt_limited: false, recommended_action: null };
  }
  const inBand =
    slo.order_counts_cold_warn_min != null &&
    orderCountsColdAvg > slo.order_counts_cold_warn_min &&
    orderCountsColdAvg <= slo.order_counts_cold_max;
  const rtt_limited = inBand && !latencyPass && latencyWarns.length > 0;
  const recommended_action = rtt_limited
    ? "measure on deployed same-region environment (set OWNER_DASHBOARD_PERF_ENV=prod_same_region); do not tune SQL for linked RTT"
    : !structuralPass
      ? "fix structural regression (delivery_summary_snapshot, 1 RTT, fallback 0) before latency tuning"
      : !latencyPass && mode === "prod_same_region"
        ? "investigate prod cold/warm latency (same-region runtime + DB)"
        : null;
  return { rtt_limited, recommended_action };
}

/**
 * @param {object} input
 */
export function buildMeasureReport(input) {
  const {
    environment_mode,
    structural,
    latency,
    samples,
    rpc_server_sql_ms,
    rtt_limited,
    recommended_action,
  } = input;

  const structural_pass =
    structural.order_counts.pass &&
    structural.hub_badge.pass &&
    structural.notifications.pass;
  const latency_pass = latency.pass;

  return {
    environment_mode,
    structural_pass,
    latency_pass,
    rtt_limited,
    recommended_action,
    rpc_server_sql_ms,
    gates: structural,
    latency,
    samples,
    ci_exit_code: structural_pass ? (rtt_limited ? 0 : latency_pass ? 0 : 1) : 1,
  };
}
