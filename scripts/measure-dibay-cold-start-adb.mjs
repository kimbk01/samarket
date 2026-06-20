#!/usr/bin/env node
/**
 * Native APK cold start 3-run measurement (commit baseline).
 *
 * Usage:
 *   node scripts/measure-dibay-cold-start-adb.mjs [device_serial] [--runs=3] [--out=docs/perf/dibay-boot-cold-start.json]
 *
 * Requires: adb, debuggable WebView (webview_devtools_remote socket).
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = "com.dibay.app";
const args = process.argv.slice(2);
const runsArg = args.find((a) => a.startsWith("--runs="));
const outArg = args.find((a) => a.startsWith("--out="));
const RUNS = runsArg ? Number(runsArg.split("=")[1]) : 3;
const OUT_PATH = resolve(
  outArg?.split("=")[1] ??
    "docs/perf/dibay-boot-cold-start-67676fa9.json"
);
const DEVICE = args.find((a) => !a.startsWith("--")) ?? pickDefaultDevice();
const COMMIT = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const BASELINE_COMMIT = execSync("git rev-parse 67676fa9", { encoding: "utf8" }).trim();
const WAIT_MS = 12_000;

function pickDefaultDevice() {
  const out = execSync("adb devices", { encoding: "utf8" });
  const serials = out
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split("\t")[0])
    .filter((s) => s && s !== "List");
  if (serials.length === 0) throw new Error("No adb device");
  return serials[0];
}

function adb(...cmd) {
  return execSync(["adb", "-s", DEVICE, ...cmd].join(" "), {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseLogcat(text) {
  const lines = text.split("\n");
  const events = {
    app_start_ms: null,
    onPageFinished_ms: null,
    dismiss_js_reason: null,
    dismiss_js_ms: null,
    dismiss_native_source: null,
    dismiss_native_ms: null,
    native_fallback: false,
    native_fallback_elapsed_ms: null,
  };
  const t0 = Date.now();

  for (const line of lines) {
    if (
      !line.includes("DIBAY_WebView") &&
      !line.includes("Capacitor/Console") &&
      !line.includes("[dibay-boot]")
    ) {
      continue;
    }
    const m = line.match(/^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
    const ts = m ? parseLogTime(m[1]) : null;

    if (line.includes("DIBAY_WebView") && line.includes("app_start")) {
      events.app_start_ms = ts;
    }
    if (line.includes("onPageFinished url=")) {
      events.onPageFinished_ms = ts;
    }
    if (line.includes("[dibay-boot] dismissSplash reason=")) {
      const rm = line.match(/reason=([^\s]+)/);
      events.dismiss_js_reason = rm?.[1] ?? null;
      events.dismiss_js_ms = ts;
    }
    if (line.includes("dismissSplash success source=")) {
      const sm = line.match(/source=([^\s]+)/);
      events.dismiss_native_source = sm?.[1] ?? null;
      events.dismiss_native_ms = ts;
      if (events.dismiss_native_source?.startsWith("native_fallback")) {
        events.native_fallback = true;
        const em = events.dismiss_native_source.match(/elapsed_ms=(\d+)/);
        events.native_fallback_elapsed_ms = em ? Number(em[1]) : null;
      }
    }
  }

  events._logcat_wall_anchor = t0;
  return events;
}

function parseLogTime(s) {
  const d = new Date();
  const [datePart, timePart] = s.split(" ");
  const [mo, day] = datePart.split("-").map(Number);
  const [hh, mm, ssMs] = timePart.split(":");
  const [ss, ms] = ssMs.split(".").map(Number);
  d.setMonth(mo - 1, day);
  d.setHours(Number(hh), Number(mm), ss, ms);
  return d.getTime();
}

async function cdpEvaluate(wsUrl, expression, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("CDP timeout"));
    }, timeoutMs);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        })
      );
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === 1) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result?.result?.value ?? null);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket error"));
    });
  });
}

async function pollMetrics(wsUrl, attempts = 8, intervalMs = 1000) {
  const expr = `JSON.stringify({
    metrics: window.__dibayBootMetrics || null,
    verify: window.__dibayBootVerify ? {
      entries: window.__dibayBootVerify.entries,
      firstPaintAtMs: window.__dibayBootVerify.firstPaintAtMs
    } : null
  })`;
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await cdpEvaluate(wsUrl, expr, 6000);
      if (last) {
        const parsed = JSON.parse(last);
        if (parsed?.metrics?.reactMounted != null) return parsed;
      }
    } catch {
      /* retry */
    }
    await sleep(intervalMs);
  }
  if (last) {
    try {
      return JSON.parse(last);
    } catch {
      return { raw: last };
    }
  }
  return null;
}

async function connectCdp(pid) {
  try {
    execSync(`adb -s ${DEVICE} forward --remove tcp:9222`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  execSync(
    `adb -s ${DEVICE} forward tcp:9222 localabstract:webview_devtools_remote_${pid}`
  );
  const list = execSync("curl -sf http://127.0.0.1:9222/json/list", {
    encoding: "utf8",
  });
  const pages = JSON.parse(list);
  const page = pages.find((p) => p.type === "page" && p.url?.includes("samarket"));
  if (!page?.webSocketDebuggerUrl) throw new Error("CDP page not found");
  const localWs = page.webSocketDebuggerUrl.replace(
    "ws://127.0.0.1:9222",
    "ws://127.0.0.1:9222"
  );
  return localWs;
}

async function measureRun(runIndex) {
  console.log(`\n[cold-start] run ${runIndex + 1}/${RUNS} device=${DEVICE}`);
  adb("logcat", "-c");
  adb("shell", "am", "force-stop", PKG);
  await sleep(1200);
  adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(2500);
  const pid = adb("shell", "pidof", PKG);
  if (!pid) throw new Error("App PID not found");
  console.log(`  pid=${pid}`);

  const wsUrl = await connectCdp(pid);
  await sleep(1500);
  let parsed = null;
  try {
    parsed = await pollMetrics(wsUrl);
  } catch (e) {
    console.warn(`  CDP poll failed: ${e.message}`);
  }
  await sleep(8000);
  try {
    const final = await pollMetrics(wsUrl, 2, 500);
    if (final?.metrics) parsed = final;
  } catch {
    /* keep prior */
  }

  const logcat = adb("logcat", "-d");
  const logEvents = parseLogcat(logcat);

  const metrics = parsed?.metrics ?? {};
  const run = {
    run: runIndex + 1,
    device: DEVICE,
    pid,
    commit: COMMIT,
    baseline_commit: BASELINE_COMMIT,
    measured_at: new Date().toISOString(),
    metrics: {
      firstPaint: metrics.firstPaint ?? null,
      reactMounted: metrics.reactMounted ?? null,
      homeVisible: metrics.homeVisible ?? null,
      apiDone: metrics.apiDone ?? null,
      thumbnailVisible: metrics.thumbnailVisible ?? null,
      firstHtml: metrics.firstHtml ?? null,
      splashDismissReason: metrics.splashDismissReason ?? null,
    },
    logEvents,
    verify: parsed?.verify ?? null,
    verify_entry_count: parsed?.verify?.entries?.length ?? null,
  };
  console.log(
    `  metrics: fp=${run.metrics.firstPaint} rm=${run.metrics.reactMounted} hv=${run.metrics.homeVisible} api=${run.metrics.apiDone} thumb=${run.metrics.thumbnailVisible} dismiss=${run.metrics.splashDismissReason} fallback=${logEvents.native_fallback}`
  );
  return run;
}

function median(nums) {
  const a = nums.filter((n) => n != null && Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function p95(nums) {
  const a = nums.filter((n) => n != null && Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const idx = Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1);
  return a[idx];
}

function summarize(runs) {
  const keys = [
    "firstPaint",
    "reactMounted",
    "homeVisible",
    "apiDone",
    "thumbnailVisible",
  ];
  const summary = {};
  for (const k of keys) {
    const vals = runs.map((r) => r.metrics[k]);
    summary[k] = { median: median(vals), p95: p95(vals), values: vals };
  }
  summary.native_fallback_count = runs.filter((r) => r.logEvents.native_fallback).length;
  summary.dismiss_reasons = runs.map(
    (r) => r.metrics.splashDismissReason ?? r.logEvents.dismiss_js_reason
  );
  return summary;
}

function judge(summary) {
  const rmMedian = summary.reactMounted.median;
  const rmP95 = summary.reactMounted.p95;
  const fpMedian = summary.firstPaint.median;
  const fallbackCount = summary.native_fallback_count;
  const lines = [];

  if (rmMedian != null && rmMedian < 3000 && fallbackCount === 0) {
    lines.push("판정: reactMounted < 3s · native fallback 0회 → **현재 splash 정책 유지**");
  } else if (fallbackCount >= 2 || (rmP95 != null && rmP95 >= 2800)) {
    lines.push(
      "판정: reactMounted가 3s 근처·fallback 빈번 → **fallback 4~5s 조정 검토**(측정 근거 후)"
    );
  } else if (fallbackCount === 1) {
    lines.push("판정: fallback 1회 — **관찰 유지**, 추가 3회 측정 권장");
  } else {
    lines.push("판정: reactMounted < 3s · fallback 드묾 → **현재 유지**");
  }

  if (fpMedian != null && rmMedian != null && fpMedian + 400 < rmMedian) {
    lines.push("참고: firstPaint << reactMounted → firstPaint dismiss 우선순위는 이미 적용됨");
  }

  if (summary.homeVisible.median != null && summary.apiDone.median != null) {
    lines.push(
      `참고: homeVisible median=${Math.round(summary.homeVisible.median)}ms · apiDone median=${Math.round(summary.apiDone.median)}ms — metric only, 진입 gate 아님`
    );
  }

  if (summary.thumbnailVisible.median != null && summary.thumbnailVisible.median > 5000) {
    lines.push("참고: thumbnailVisible 지연 → 피드/이미지 P1 분리");
  }

  return lines.join("\n");
}

async function main() {
  console.log(`measure-dibay-cold-start-adb commit=${COMMIT} device=${DEVICE} runs=${RUNS}`);
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    runs.push(await measureRun(i));
    if (i < RUNS - 1) await sleep(2000);
  }
  const summary = summarize(runs);
  const report = {
    commit: COMMIT,
    baseline_commit: BASELINE_COMMIT,
    device: DEVICE,
    measured_at: new Date().toISOString(),
    runs,
    summary,
    judgment: judge(summary),
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nSaved: ${OUT_PATH}`);
  console.log("\n=== summary (performance.now ms) ===");
  console.table(
    Object.fromEntries(
      Object.entries(summary)
        .filter(([, v]) => v?.median != null)
        .map(([k, v]) => [k, { median: Math.round(v.median), p95: Math.round(v.p95) }])
    )
  );
  console.log(`native_fallback_count: ${summary.native_fallback_count}`);
  console.log("\n" + report.judgment);

  const lastRun = runs[runs.length - 1];
  const verifyInput = {
    entries: lastRun?.verify?.entries ?? [],
    firstPaintAtMs: lastRun?.verify?.firstPaintAtMs ?? lastRun?.metrics?.firstPaint ?? null,
    metrics: lastRun?.metrics ?? null,
    runs_summary: summary,
  };
  const verifyPath = OUT_PATH.replace(".json", "-verify-input.json");
  writeFileSync(verifyPath, JSON.stringify(verifyInput, null, 2));
  console.log(`\nVerify input: ${verifyPath}`);
  spawnSync("node", ["scripts/dibay-boot-verify-report.mjs", verifyPath], {
    stdio: "inherit",
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
