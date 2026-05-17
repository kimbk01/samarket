/**
 * R2-M5 측정 전용 — storageState 로 방 진입 perf 콘솔 수집 (운영 번들 미포함).
 * input 세부 타이밍은 `node scripts/perf/r2-m6-capture-once.mjs`.
 * node scripts/r2-m5-capture-once.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storage = path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
const runs = Number(process.env.R2_M5_RUNS || "3");

function pick(text, re) {
  const m = text.match(re);
  return m ? m[1] : null;
}

async function oneRun(browser, runIndex) {
  const logs = [];
  const context = await browser.newContext({ storageState: storage });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      t.includes("bootstrap_fetch:") ||
      t.includes("MESSENGER_ROOM_ENTRY") ||
      t.includes("cm-room-entry-timing")
    ) {
      logs.push(t);
    }
  });

  await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
    } catch {
      /* ignore */
    }
  });
  const row = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])').first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  const tap = row.locator('[role="button"]').first();
  await tap.click({ timeout: 15_000 });
  await page.waitForURL(/\/community-messenger\/rooms\/[^/]+/, { timeout: 45_000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);

  const snap = await page.evaluate(() => {
    const w = window;
    const get = w.getMessengerHomeVerificationSnapshot;
    const phases = get?.()?.appWidePhaseLastMs ?? {};
    const p = (k) => phases[`messenger_room_entry_${k}`] ?? null;
    return {
      composer_textarea_visible_ms: p("composer_textarea_visible_ms"),
      composer_mount_start_ms: p("composer_mount_start_ms"),
      composer_mount_done_ms: p("composer_mount_done_ms"),
      input_ready_ms: p("input_ready_ms"),
      first_input_enabled_ms: p("first_input_enabled_ms"),
      first_message_render_ms: p("first_message_render_ms"),
      display_room_messages_ready_ms: p("display_room_messages_ready_ms"),
      message_list_ready_ms: p("message_list_ready_ms"),
    };
  });

  let monitoredBootstrap = null;
  let clientWire = null;
  let serverRoute = null;
  let gateGap = null;
  for (const line of logs) {
    if (line.includes("monitored_bootstrap_fetch_ms")) {
      const j = pick(line, /monitored_bootstrap_fetch_ms['"]?\s*:\s*(\d+)/);
      if (j) monitoredBootstrap = Number(j);
    }
    if (line.includes("E_client_wire_plus_parse_ms") || line.includes("wire_plus_parse")) {
      const j = pick(line, /E_client_wire_plus_parse_ms['"]?\s*:\s*(\d+)/);
      if (j) clientWire = Number(j);
    }
    if (line.includes("0_server_route_total_ms")) {
      const j = pick(line, /0_server_route_total_ms['"]?\s*:\s*(\d+)/);
      if (j) serverRoute = Number(j);
    }
    if (line.startsWith("MESSENGER_ROOM_ENTRY_GATE_GAP_JSON:")) {
      gateGap = line.replace("MESSENGER_ROOM_ENTRY_GATE_GAP_JSON:", "").trim();
    }
  }

  await context.close();
  return {
    runIndex,
    snap,
    monitoredBootstrap,
    clientWire,
    serverRoute,
    gateGap,
    logsSample: logs.slice(0, 8),
  };
}

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1));
  if (i < runs - 1) await new Promise((r) => setTimeout(r, 400));
}
await browser.close();

// eslint-disable-next-line no-console
console.log("\n=== R2_M5_CAPTURE_JSON ===\n" + JSON.stringify(results, null, 2) + "\n=== END ===\n");
