/**
 * 성능 측정 전용 Next dev — 일반 `npm run dev` 와 분리.
 * @see docs/performance/dev-measurement-runbook.md
 *
 * 이미 설정된 env 는 덮어쓰지 않음(사용자 우선).
 * Windows / macOS / Linux — node 만 필요(cross-env 는 package.json dev:measure 에서 heap 한도만 적용).
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

/** 비어 있을 때만 기본값 적용 */
function setDefault(key, value) {
  const cur = process.env[key];
  if (cur === undefined || String(cur).trim() === "") {
    process.env[key] = String(value);
  }
}

function setMessengerTraceDefaultsOff() {
  const keys = [
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_BOOTSTRAP_BREAKDOWN",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_LIST_OWNER",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_RT_STORE_SCOPE",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_OPEN_ALIGN",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_RENDER",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_SCROLL",
    "NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_POLISH",
    "MESSENGER_PERF_TRACE_BOOTSTRAP",
    "MESSENGER_PERF_TRACE_ROOM_SNAPSHOT",
    "MESSENGER_PERF_TRACE_ROOM_RSC",
    "SAMARKET_MESSENGER_TRACE_LOG",
    "SAMARKET_PERF_LOG",
    "CHAT_PERF_LOG",
    "NEXT_PUBLIC_SAMARKET_PERF_LOG",
  ];
  for (const k of keys) {
    setDefault(k, "0");
  }
}

setDefault("SAMARKET_DEV_MEASURE_MODE", "1");
setDefault("SAMARKET_MONITORING_MAX_EVENTS_DEV", "32");
setDefault("SAMARKET_DEV_SINGLEFLIGHT_MAX_KEYS", "128");
setDefault("SAMARKET_DEV_MEMORY_WATCH", "1");
setDefault("SAMARKET_DEV_MEMORY_WATCH_MS", "30000");
setDefault("SAMARKET_PERF_REAL_API_COST", "1");
setDefault("SAMARKET_OWNER_DASHBOARD_PERF", "1");
setMessengerTraceDefaultsOff();

/** 측정 프로세스는 4GB 상한으로 조기 누수 감지( package.json dev:measure 의 NODE_OPTIONS 와 병행 ) */
setDefault("SAMARKET_DEV_HEAP_MB", "4096");

// eslint-disable-next-line no-console -- measure dev banner
console.log("[samarket-dev-measure] performance measurement dev — env defaults applied (existing env preserved)", {
  SAMARKET_DEV_MEASURE_MODE: process.env.SAMARKET_DEV_MEASURE_MODE,
  SAMARKET_MONITORING_MAX_EVENTS_DEV: process.env.SAMARKET_MONITORING_MAX_EVENTS_DEV,
  SAMARKET_DEV_SINGLEFLIGHT_MAX_KEYS: process.env.SAMARKET_DEV_SINGLEFLIGHT_MAX_KEYS,
  SAMARKET_DEV_MEMORY_WATCH: process.env.SAMARKET_DEV_MEMORY_WATCH,
  SAMARKET_PERF_REAL_API_COST: process.env.SAMARKET_PERF_REAL_API_COST,
  SAMARKET_OWNER_DASHBOARD_PERF: process.env.SAMARKET_OWNER_DASHBOARD_PERF,
  SAMARKET_DEV_HEAP_MB: process.env.SAMARKET_DEV_HEAP_MB,
  next_step: "npm run measure:owner-dashboard-api (after 2x [dev-memory-growth-diagnosis])",
  runbook: "docs/performance/dev-measurement-runbook.md",
});

const nextDev = path.join(__dirname, "next-dev.cjs");
const extra = process.argv.slice(2);
const child = spawn(process.execPath, [nextDev, ...extra], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
