/**
 * CM R2 perceived latency — prod-like 3-run capture (측정 전용).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/cm-r2-perceived-prod-validate.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const storage = path.join(repoRoot, "tests", "e2e", ".auth", "cm-storage.json");
const outJson = path.join(repoRoot, "docs", "perf", "cm-r2-perceived-latency-prod-validation.json");
const RUNS = Number(process.env.CM_R2_RUNS || "3");

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

function collectFromLogs(logs) {
  const out = { bootstrapV2: [], homeSyncDeep: [], cmLongtask: [], cmLongtaskSevere: [], listOwner: [] };
  for (const line of logs) {
    if (line.includes("[cm-bootstrap-v2-client]")) {
      const j = parseJsonLog(line);
      if (j) out.bootstrapV2.push(j);
    }
    if (line.includes("[home-sync-deep-trace]")) {
      const j = parseJsonLog(line);
      if (j) out.homeSyncDeep.push(j);
    }
    if (line.includes("[cm-longtask-severe]")) out.cmLongtaskSevere.push(line);
    else if (line.includes("[cm-longtask]")) out.cmLongtask.push(line);
    if (line.includes("[cm-list-owner]")) out.listOwner.push(line);
  }
  return out;
}

async function readSnap(page) {
  return page.evaluate(() => {
    const snap = window.getMessengerHomeVerificationSnapshot?.() ?? null;
    return { verification: snap, phases: snap?.appWidePhaseLastMs ?? {} };
  });
}

async function coldHomeRun(page, runIndex) {
  const logs = [];
  const onConsole = (msg) => {
    const t = msg.text();
    if (/cm-bootstrap-v2|home-sync-deep|cm-longtask|cm-list-owner|critical-bootstrap/i.test(t)) logs.push(t);
  };
  page.on("console", onConsole);
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
      sessionStorage.removeItem("samarket:messenger:bootstrap:critical");
      sessionStorage.removeItem("samarket:messenger:bootstrap:full");
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  const t0 = Date.now();
  await page
    .waitForFunction(
      () => {
        const frame = document.querySelector('[data-cm-home-frame="true"]');
        if (!frame) return false;
        const rows = frame.querySelectorAll('[data-messenger-chat-row="true"]').length;
        const skel = frame.querySelector("[data-cm-home-skeleton]");
        const empty = frame.querySelector('[data-cm-home-empty-state="true"]');
        return rows > 0 || empty || (skel == null && frame.getAttribute("data-cm-home-state") !== "skeleton");
      },
      { timeout: 75_000 }
    )
    .catch(() => {});
  const dom = await page.evaluate(() => {
    const frame = document.querySelector('[data-cm-home-frame="true"]');
    return {
      rows: frame?.querySelectorAll('[data-messenger-chat-row="true"]')?.length ?? 0,
      skel: Boolean(frame?.querySelector("[data-cm-home-skeleton]")),
      state: frame?.getAttribute("data-cm-home-state") ?? "",
      empty: Boolean(frame?.querySelector('[data-cm-home-empty-state="true"]')),
    };
  });
  const firstPaintMs = Date.now() - t0;
  await page.waitForTimeout(1200);
  const snap = await readSnap(page);
  page.off("console", onConsole);
  const parsed = collectFromLogs(logs);
  const lastV2 = parsed.bootstrapV2[parsed.bootstrapV2.length - 1];
  return {
    scenario: "cold_home_chats",
    runIndex,
    dom,
    firstPaintMs,
    blankFlash: dom.rows === 0 && dom.skel,
    shell_visible_ms: lastV2?.shell_visible_ms ?? null,
    room_list_visible_ms: lastV2?.room_list_visible_ms ?? null,
    critical_response_ms: lastV2?.critical_response_ms ?? null,
    used_cached_snapshot: lastV2?.used_cached_snapshot ?? null,
    refreshSilent: snap.verification?.refreshInvocationSilent ?? 0,
    homeSyncFetch: snap.verification?.homeSyncNetworkFetch ?? 0,
    logs: parsed,
  };
}

async function deliveryInboxRun(page, runIndex) {
  const logs = [];
  page.on("console", (msg) => logs.push(msg.text()));
  await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(2000);
  const dom = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-messenger-chat-row="true"]').length,
    badges: document.querySelectorAll("[data-cm-unread-badge='true']").length,
  }));
  const snap = await readSnap(page);
  return { scenario: "delivery_inbox_unread", runIndex, dom, refreshSilent: snap.verification?.refreshInvocationSilent ?? 0, homeSyncFetch: snap.verification?.homeSyncNetworkFetch ?? 0, logs: collectFromLogs(logs) };
}

async function deliveryRoomRun(page, runIndex) {
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/cm-bootstrap|longtask|MESSENGER_ROOM|cm-room-entry|critical-bootstrap/i.test(t)) logs.push(t);
  });
  await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const rowLoc = page.locator('[data-messenger-chat-row="true"]').first();
  if ((await rowLoc.count()) === 0) return { scenario: "delivery_room_unread", runIndex, skipped: true, reason: "no_rows" };
  await rowLoc.locator('[role="button"]').first().click({ timeout: 15_000 }).catch(() => rowLoc.click());
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => {});
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelectorAll("[data-cm-timeline-message-row]").length > 0 || document.querySelector('[aria-busy="true"]') != null, { timeout: 25_000 }).catch(() => {});
  const emptyFillMs = Date.now() - t0;
  const timeline = await page.evaluate(() => ({
    messageRows: document.querySelectorAll("[data-cm-timeline-message-row]").length,
    spinner: Boolean(document.querySelector('[aria-busy="true"]')),
  }));
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  const snap = await readSnap(page);
  const p = snap.phases ?? {};
  return {
    scenario: "delivery_room_unread",
    runIndex,
    timeline,
    emptyFillMs,
    room_shell_visible_ms: p.messenger_room_entry_room_shell_visible_ms ?? null,
    composer_visible_ms: p.messenger_room_entry_composer_textarea_visible_ms ?? null,
    first_message_render_ms: p.messenger_room_entry_first_message_render_ms ?? null,
    logs: collectFromLogs(logs),
  };
}

async function visibilityRun(page, runIndex) {
  const logs = [];
  page.on("console", (msg) => logs.push(msg.text()));
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2000);
  const before = await readSnap(page);
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
  const after = await readSnap(page);
  return {
    scenario: "visibility_restore",
    runIndex,
    refreshSilentDelta: (after.verification?.refreshInvocationSilent ?? 0) - (before.verification?.refreshInvocationSilent ?? 0),
    homeSyncDelta: (after.verification?.homeSyncNetworkFetch ?? 0) - (before.verification?.homeSyncNetworkFetch ?? 0),
    domRows: await page.evaluate(() => document.querySelectorAll('[data-messenger-chat-row="true"]').length),
    logs: collectFromLogs(logs),
  };
}

async function loginTestUser(page) {
  const envUser = process.env.E2E_TEST_USERNAME?.trim();
  const envPass = process.env.E2E_TEST_PASSWORD ?? "";
  const candidates =
    envUser && envPass
      ? [{ id: envUser.includes("@") ? envUser : envUser, pass: envPass }]
      : [
          { id: "aaaa", pass: "1234" },
          { id: "aaaa@samarket.local", pass: "1234" },
        ];
  for (const c of candidates) {
    await page.goto(`${origin}/login?next=%2Fcommunity-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pwForm = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
    const idInput = pwForm.locator('input[type="text"]').first();
    const passInput = pwForm.locator('input[type="password"]').first();
    await idInput.fill(c.id);
    await passInput.fill(c.pass);
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
  throw new Error("UI login failed — E2E_TEST_USERNAME/PASSWORD 또는 aaaa/1234·test_users 확인");
}

const browser = await chromium.launch();
const results = [];
for (let i = 1; i <= RUNS; i += 1) {
  const context = await browser.newContext(fs.existsSync(storage) ? { storageState: storage } : {});
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* */
    }
  });
  const page = await context.newPage();
  await loginTestUser(page);
  results.push(await coldHomeRun(page, i));
  results.push(await deliveryInboxRun(page, i));
  results.push(await deliveryRoomRun(page, i));
  results.push(await visibilityRun(page, i));
  await context.close();
  if (i < RUNS) await new Promise((r) => setTimeout(r, 500));
}
await browser.close();

const cold = results.filter((r) => r.scenario === "cold_home_chats");
const room = results.filter((r) => r.scenario === "delivery_room_unread" && !r.skipped);
const vis = results.filter((r) => r.scenario === "visibility_restore");

const summary = {
  capturedAt: new Date().toISOString(),
  origin,
  account: "aaaa (e2e default)",
  env: {
    NEXT_PUBLIC_MESSENGER_PERF_TRACE: "1 (build)",
    NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET: "1 (build)",
    SAMARKET_MESSENGER_TRACE_LOG: "1 (server start)",
    SAMARKET_LOG_HOME_SYNC_DEEP_TRACE: "1 (server start)",
    NODE_ENV: "production (npm run start)",
  },
  runs: RUNS,
  averages: {
    cold_first_paint_ms: avg(cold.map((r) => r.firstPaintMs)),
    cold_room_list_visible_ms: avg(cold.map((r) => r.room_list_visible_ms)),
    cold_critical_response_ms: avg(cold.map((r) => r.critical_response_ms)),
    cold_cached_snapshot_hits: cold.filter((r) => r.used_cached_snapshot === true).length,
    room_empty_fill_ms: avg(room.map((r) => r.emptyFillMs)),
    room_shell_visible_ms: avg(room.map((r) => r.room_shell_visible_ms)),
    composer_visible_ms: avg(room.map((r) => r.composer_visible_ms)),
    visibility_silent_refresh_delta: avg(vis.map((r) => r.refreshSilentDelta)),
    visibility_home_sync_delta: avg(vis.map((r) => r.homeSyncDelta)),
  },
  observability: {
    bootstrap_v2_log_lines: results.reduce((n, r) => n + (r.logs?.bootstrapV2?.length ?? 0), 0),
    home_sync_deep_log_lines: results.reduce((n, r) => n + (r.logs?.homeSyncDeep?.length ?? 0), 0),
    cm_longtask_lines: results.reduce((n, r) => n + (r.logs?.cmLongtask?.length ?? 0), 0),
    cm_longtask_severe_lines: results.reduce((n, r) => n + (r.logs?.cmLongtaskSevere?.length ?? 0), 0),
    list_owner_patch_lines: results.reduce((n, r) => n + (r.logs?.listOwner?.length ?? 0), 0),
  },
  results,
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
