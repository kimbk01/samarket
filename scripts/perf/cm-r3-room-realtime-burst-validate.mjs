/**
 * CM R3 — room empty→fill · realtime burst (prod-like 3-run).
 * node scripts/perf/cm-r3-room-realtime-burst-validate.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outJson = path.join(repoRoot, "docs", "perf", "cm-r3-room-realtime-burst-validation.json");
const RUNS = Number(process.env.CM_R3_RUNS || "3");

function avg(nums) {
  const v = nums.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

function parseJsonLog(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < text.length; j += 1) {
    if (text[j] === "{") depth += 1;
    if (text[j] === "}") depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function pickPhase(phases, ...keys) {
  for (const k of keys) {
    const v = phases[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

async function loginTestUser(page) {
  const envUser = process.env.E2E_TEST_USERNAME?.trim();
  const envPass = process.env.E2E_TEST_PASSWORD ?? "";
  const candidates =
    envUser && envPass
      ? [{ id: envUser, pass: envPass }]
      : [
          { id: "aaaa", pass: "1234" },
          { id: "aaaa@samarket.local", pass: "1234" },
        ];
  for (const c of candidates) {
    await page.goto(`${origin}/login?next=%2Fcommunity-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pwForm = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
    await pwForm.locator('input[type="text"]').first().fill(c.id);
    await pwForm.locator('input[type="password"]').first().fill(c.pass);
    await pwForm.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
    if (!page.url().includes("/login")) {
      await page.evaluate(() => {
        try {
          sessionStorage.setItem("samarket:debug:runtime", "1");
        } catch {
          /* */
        }
      });
      return;
    }
  }
  throw new Error("UI login failed");
}

async function probeTimeline(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("[data-cm-timeline-message-row]").length;
    const spinner = Boolean(document.querySelector('[aria-busy="true"]'));
    const syncText = document.body.innerText.includes("동기화") || document.body.innerText.includes("잠시만");
    const emptyCopy =
      document.body.innerText.includes("아직 메시지가 없") ||
      document.body.innerText.includes("첫 인사");
    return {
      messageRows: rows,
      spinner,
      syncText,
      emptyCopy,
      timeline_empty_flash: rows === 0 && !spinner && emptyCopy,
    };
  });
}

async function readRoomPhases(page) {
  return page.evaluate(() => {
    const phases = window.getMessengerHomeVerificationSnapshot?.()?.appWidePhaseLastMs ?? {};
    return phases;
  });
}

function collectLogs(logs) {
  const out = {
    bootstrapV2: [],
    cmLongtask: [],
    cmLongtaskSevere: [],
    cmRoomEntryV2: [],
    cmRoomR5Mount: [],
    cmRoomR6DisplayGate: [],
    cmRoomR7FirstRowCommit: [],
    cmRtIngestBurst: [],
    frameBudget: [],
  };
  for (const line of logs) {
    if (line.includes("[cm-bootstrap-v2-client]")) {
      const j = parseJsonLog(line);
      if (j) out.bootstrapV2.push(j);
    }
    if (line.includes("[cm-longtask-severe]")) out.cmLongtaskSevere.push(line);
    else if (line.includes("[cm-longtask]")) out.cmLongtask.push(line);
    if (line.includes("[cm-room-entry-v2]")) {
      const j = parseJsonLog(line);
      if (j) out.cmRoomEntryV2.push(j);
    }
    if (line.includes("[cm-room-r5-mount-breakdown]")) {
      const j = parseJsonLog(line);
      if (j) out.cmRoomR5Mount.push(j);
    }
    if (line.includes("[cm-room-r6-display-gate]")) {
      const j = parseJsonLog(line);
      if (j) out.cmRoomR6DisplayGate.push(j);
    }
    if (line.includes("[cm-room-r7-first-row-commit]")) {
      const j = parseJsonLog(line);
      if (j) out.cmRoomR7FirstRowCommit.push(j);
    }
    if (line.includes("[cm-rt-ingest-burst]")) {
      const j = parseJsonLog(line);
      if (j) out.cmRtIngestBurst.push(j);
    }
    if (line.includes("frame_budget")) out.frameBudget.push(line);
  }
  return out;
}

async function openDeliveryUnreadRoom(page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* */
    }
  });
  await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(800);
  let scopeRows = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])');
  if ((await scopeRows.count()) === 0) {
    await page.goto(`${origin}/community-messenger?section=chats`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(600);
    scopeRows = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])');
  }
  const badgeRow = scopeRows.filter({ has: page.locator('[data-cm-unread-badge="true"]') }).first();
  const row = (await badgeRow.count()) > 0 ? badgeRow : scopeRows.first();
  if ((await row.count()) === 0) return null;
  const link = row.locator('a[href*="/community-messenger/rooms/"]').first();
  if ((await link.count()) > 0) {
    await link.click({ timeout: 15_000 });
  } else {
    const btn = row.locator('[role="button"]').first();
    if ((await btn.count()) > 0) await btn.click({ timeout: 15_000 });
    else await row.click();
  }
  await page.waitForURL(/\/community-messenger\/rooms\/.*cm_list=delivery/, { timeout: 45_000 }).catch(() =>
    page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 15_000 })
  );
  return page.url();
}

async function roomColdEntryRun(page, runIndex, logs) {
  const roomUrl = await openDeliveryUnreadRoom(page);
  if (!roomUrl) return { scenario: "delivery_room_cold", runIndex, skipped: true, reason: "no_rows" };

  const t0 = Date.now();
  let firstRowMs = null;
  let emptyFlashSeen = false;
  const samples = [];
  while (Date.now() - t0 < 12_000) {
    const probe = await probeTimeline(page);
    samples.push(probe);
    if (probe.timeline_empty_flash) emptyFlashSeen = true;
    if (probe.messageRows > 0 && firstRowMs == null) firstRowMs = Date.now() - t0;
    if (firstRowMs != null && !probe.spinner) break;
    await page.waitForTimeout(120);
  }
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  const phases = await readRoomPhases(page);
  const perfEvents = await page.evaluate(() => window.__cmPerfEvents ?? []);
  const entryLogs = collectLogs(logs);
  const shellFromLog = entryLogs.cmRoomEntryV2.at(-1)?.room_shell_visible_ms ?? null;
  const composerFromLog = entryLogs.cmRoomEntryV2.at(-1)?.composer_visible_ms ?? null;
  const finalProbe = await probeTimeline(page);
  return {
    scenario: "delivery_room_cold",
    runIndex,
    roomUrl,
    first_message_visible_ms: firstRowMs,
    timeline_empty_flash: emptyFlashSeen || finalProbe.timeline_empty_flash,
    final_message_rows: finalProbe.messageRows,
    room_shell_visible_ms:
      pickPhase(phases, "room_shell_visible_ms", "messenger_room_entry_room_shell_visible_ms") ?? shellFromLog,
    composer_visible_ms:
      pickPhase(phases, "composer_visible_ms", "messenger_room_entry_composer_textarea_visible_ms") ??
      composerFromLog,
    first_message_render_ms: pickPhase(phases, "messenger_room_entry_first_message_render_ms"),
    first_message_visible_ms: pickPhase(phases, "messenger_room_entry_first_message_visible_ms"),
    dom_first_message_visible_ms: pickPhase(phases, "messenger_room_entry_dom_first_message_visible_ms"),
    message_list_first_paint_ms: pickPhase(phases, "messenger_room_entry_message_list_first_paint_ms"),
    virtualizer_ready_ms: pickPhase(phases, "messenger_room_entry_virtualizer_ready_ms"),
    timeline_heavy_ready_ms: pickPhase(phases, "messenger_room_entry_timeline_heavy_ready_ms"),
    first_row_dom_visible_ms: pickPhase(phases, "messenger_room_entry_first_row_dom_visible_ms"),
    first_row_commit_end_ms: pickPhase(phases, "messenger_room_entry_first_row_commit_end_ms"),
    timeline_rows_prepare_ms: pickPhase(phases, "messenger_room_entry_timeline_rows_prepare_ms"),
    bootstrap_response_ms: pickPhase(phases, "messenger_room_entry_room_bootstrap_response_end_ms"),
    display_ready_ms: pickPhase(phases, "messenger_room_entry_display_room_messages_ready_ms"),
    logs: collectLogs(logs),
    cm_perf_events: perfEvents,
    timeline_samples: samples.length,
  };
}

async function roomReentryRun(page, runIndex, logs, roomUrl) {
  await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  if (roomUrl) {
    await page.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } else {
    await openDeliveryUnreadRoom(page);
  }
  const t0 = Date.now();
  let emptyFlashSeen = false;
  let firstRowMs = null;
  for (let i = 0; i < 40; i += 1) {
    const probe = await probeTimeline(page);
    if (probe.timeline_empty_flash) emptyFlashSeen = true;
    if (probe.messageRows > 0 && firstRowMs == null) firstRowMs = Date.now() - t0;
    if (firstRowMs != null && probe.messageRows > 0) break;
    await page.waitForTimeout(100);
  }
  const phases = await readRoomPhases(page);
  return {
    scenario: "delivery_room_reentry",
    runIndex,
    first_message_visible_ms: firstRowMs,
    timeline_empty_flash: emptyFlashSeen,
    room_shell_visible_ms: pickPhase(phases, "room_shell_visible_ms"),
    composer_visible_ms: pickPhase(phases, "composer_visible_ms"),
    logs: collectLogs(logs),
  };
}

async function roomSwitchRun(page, runIndex, logs) {
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-messenger-chat-row="true"]', { timeout: 60_000 });
  const rows = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])');
  const n = await rows.count();
  if (n < 2) return { scenario: "room_switch", runIndex, skipped: true, reason: "need_2_rooms" };
  const openRow = async (idx) => {
    const row = rows.nth(idx);
    const btn = row.locator('[role="button"]').first();
    if ((await btn.count()) > 0) await btn.click();
    else await row.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
  };
  await openRow(0);
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-messenger-chat-row="true"]', { timeout: 30_000 });
  await openRow(1);
  let emptyFlashSeen = false;
  let firstRowMs = null;
  for (let i = 0; i < 30; i += 1) {
    const probe = await probeTimeline(page);
    if (probe.timeline_empty_flash) emptyFlashSeen = true;
    if (probe.messageRows > 0 && firstRowMs == null) firstRowMs = Date.now() - t0;
    if (firstRowMs != null) break;
    await page.waitForTimeout(100);
  }
  return {
    scenario: "room_switch",
    runIndex,
    switch_first_message_visible_ms: firstRowMs,
    timeline_empty_flash: emptyFlashSeen,
    logs: collectLogs(logs),
  };
}

async function realtimeBurstRun(page, runIndex, logs, roomUrl) {
  if (!roomUrl) {
    await openDeliveryUnreadRoom(page);
    roomUrl = page.url();
  } else {
    await page.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
  const hasComposer = await page
    .locator("textarea")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasComposer) {
    return { scenario: "realtime_burst_synthetic", runIndex, skipped: true, reason: "no_composer", logs: collectLogs(logs) };
  }
  await page
    .waitForFunction(() => document.querySelectorAll("[data-cm-timeline-message-row]").length > 0, {
      timeout: 25_000,
    })
    .catch(() => {});
  const burstResult = await page.evaluate(async () => {
    const roomMatch = location.pathname.match(/\/community-messenger\/rooms\/([^/]+)/);
    const roomId = roomMatch?.[1] ?? "";
    const longtasksBefore = performance.getEntriesByType("longtask").length;
    const t0 = performance.now();
    const sim = window.__cmPerfSimulateRealtimeBurst;
    let burst_count = 40;
    let hook = false;
    if (typeof sim === "function") {
      hook = true;
      sim(40);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 1200));
    const longtasksAfter = performance.getEntriesByType("longtask").length;
    return {
      roomId,
      burst_count,
      used_perf_hook: hook,
      burst_wall_ms: Math.round(performance.now() - t0),
      longtask_delta: longtasksAfter - longtasksBefore,
      message_rows: document.querySelectorAll("[data-cm-timeline-message-row]").length,
    };
  });
  return {
    scenario: "realtime_burst_synthetic",
    runIndex,
    ...burstResult,
    logs: collectLogs(logs),
  };
}

async function r2RegressionRun(page) {
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
    sessionStorage.removeItem("samarket:messenger:bootstrap:critical");
    sessionStorage.removeItem("samarket:messenger:bootstrap:full");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-messenger-chat-row="true"]').length > 0,
    { timeout: 75_000 }
  );
  const coldBlank = await page.evaluate(() => {
    const frame = document.querySelector('[data-cm-home-frame="true"]');
    const rows = frame?.querySelectorAll('[data-messenger-chat-row="true"]')?.length ?? 0;
    const skel = Boolean(frame?.querySelector("[data-cm-home-skeleton]"));
    return { rows, skel, pass: rows > 0 && !skel };
  });
  const before = await page.evaluate(() => window.getMessengerHomeVerificationSnapshot?.() ?? null);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await page.waitForTimeout(2800);
  const after = await page.evaluate(() => window.getMessengerHomeVerificationSnapshot?.() ?? null);
  const delivery = await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, {
    waitUntil: "domcontentloaded",
  });
  void delivery;
  await page.waitForTimeout(1500);
  const badges = await page.evaluate(
    () => document.querySelectorAll("[data-cm-unread-badge='true']").length
  );
  return {
    cold_home_blank_pass: coldBlank.pass,
    cold_home_rows: coldBlank.rows,
    visibility_silent_delta:
      (after?.refreshInvocationSilent ?? 0) - (before?.refreshInvocationSilent ?? 0),
    visibility_home_sync_delta: (after?.homeSyncNetworkFetch ?? 0) - (before?.homeSyncNetworkFetch ?? 0),
    delivery_unread_badges: badges,
  };
}

const browser = await chromium.launch();
const results = [];
let lastRoomUrl = null;

for (let i = 1; i <= RUNS; i += 1) {
  const logs = [];
  const page = await browser.newPage();
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      /cm-bootstrap-v2|cm-longtask|cm-room-entry|cm-room-r[56]|cm-rt-ingest|frame_budget|critical-bootstrap/i.test(t)
    ) {
      logs.push(t);
    }
  });
  await loginTestUser(page);
  const cold = await roomColdEntryRun(page, i, logs);
  results.push(cold);
  lastRoomUrl = cold.roomUrl ?? lastRoomUrl;
  results.push(await roomReentryRun(page, i, logs, lastRoomUrl));
  results.push(await roomSwitchRun(page, i, logs));
  try {
    results.push(await realtimeBurstRun(page, i, logs, lastRoomUrl));
  } catch (err) {
    results.push({
      scenario: "realtime_burst_synthetic",
      runIndex: i,
      skipped: true,
      reason: String(err?.message ?? err),
      logs: collectLogs(logs),
    });
  }
  if (i === 1) results.push(await r2RegressionRun(page));
  await page.close();
  if (i < RUNS) await new Promise((r) => setTimeout(r, 500));
}

await browser.close();

const cold = results.filter((r) => r.scenario === "delivery_room_cold" && !r.skipped);
const reentry = results.filter((r) => r.scenario === "delivery_room_reentry");
const r2 = results.find((r) => r.cold_home_blank_pass != null);

const summary = {
  capturedAt: new Date().toISOString(),
  origin,
  runs: RUNS,
  averages: {
    first_message_visible_ms: avg(cold.map((r) => r.first_message_visible_ms)),
    timeline_empty_flash_rate: cold.filter((r) => r.timeline_empty_flash).length / Math.max(1, cold.length),
    room_shell_visible_ms: avg(cold.map((r) => r.room_shell_visible_ms)),
    composer_visible_ms: avg(cold.map((r) => r.composer_visible_ms)),
    first_message_render_ms: avg(cold.map((r) => r.first_message_render_ms)),
    bootstrap_response_ms: avg(cold.map((r) => r.bootstrap_response_ms)),
    reentry_empty_flash_rate: reentry.filter((r) => r.timeline_empty_flash).length / Math.max(1, reentry.length),
    cm_longtask_lines: results.reduce((n, r) => n + (r.logs?.cmLongtask?.length ?? 0), 0),
    cm_rt_ingest_burst_lines: results.reduce((n, r) => n + (r.logs?.cmRtIngestBurst?.length ?? 0), 0),
  },
  r2_regression: r2 ?? null,
  results,
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
