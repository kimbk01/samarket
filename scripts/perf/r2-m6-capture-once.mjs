/**
 * R2-M6 — input/composer/bootstrap 세부 타이밍 수집 (측정 전용, 운영 번들 미포함).
 * node scripts/perf/r2-m6-capture-once.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storage = path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
const runs = Number(process.env.R2_M6_RUNS || "3");

function pick(text, re) {
  const m = text.match(re);
  return m ? m[1] : null;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function phase(phases, key) {
  return num(phases[`messenger_room_entry_${key}`] ?? phases[key] ?? null);
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
  await row.locator('[role="button"]').first().click({ timeout: 15_000 });
  await page.waitForURL(/\/community-messenger\/rooms\/[^/]+/, { timeout: 45_000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);

  const snap = await page.evaluate(() => {
    const w = window;
    const phases = w.getMessengerHomeVerificationSnapshot?.()?.appWidePhaseLastMs ?? {};
    return phases;
  });

  let tapToShell = null;
  for (const line of logs) {
    if (line.includes("tap_to_shell_ms")) {
      const j = pick(line, /tap_to_shell_ms['"]?\s*:\s*(\d+)/);
      if (j) tapToShell = Number(j);
    }
  }

  const metrics = {
    tap_to_shell_ms: tapToShell,
    input_ready_ms: phase(snap, "input_ready_ms"),
    composer_mount_start_ms: phase(snap, "composer_mount_start_ms"),
    composer_mount_done_ms: phase(snap, "composer_mount_done_ms"),
    composer_mount_ms: phase(snap, "composer_mount_ms"),
    composer_textarea_visible_ms: phase(snap, "composer_textarea_visible_ms"),
    message_list_ready_ms: phase(snap, "message_list_ready_ms") ?? phase(snap, "display_room_messages_ready_ms"),
    first_message_render_ms: phase(snap, "first_message_render_ms"),
    bootstrap_fetch_start_ms: phase(snap, "room_bootstrap_request_start_ms"),
    bootstrap_fetch_done_ms: phase(snap, "room_bootstrap_response_end_ms"),
    first_input_enabled_ms: phase(snap, "first_input_enabled_ms"),
    composer_waited_for_timeline: phase(snap, "composer_waited_for_timeline"),
    composer_waited_for_virtualizer: phase(snap, "composer_waited_for_virtualizer"),
    composer_waited_for_voice: phase(snap, "composer_waited_for_voice"),
    composer_surface_source_phase1: phase(snap, "composer_surface_source_phase1"),
    phase2_controller_start_ms: phase(snap, "phase2_controller_start_ms"),
    phase2_controller_done_ms: phase(snap, "phase2_controller_done_ms"),
    phase2_first_commit_ms: phase(snap, "phase2_first_commit_ms"),
    phase2_parse_eval_ms: phase(snap, "phase2_parse_eval_ms"),
    deferred_effects_count: phase(snap, "deferred_effects_count"),
  };

  const inr = metrics.input_ready_ms;
  const shell = metrics.tap_to_shell_ms;
  const msg = metrics.message_list_ready_ms;
  metrics.hydration_blocking_ms =
    inr != null && msg != null && msg > inr ? Math.round(msg - inr) : inr != null && shell != null ? Math.round(inr - shell) : null;

  await context.close();
  return { runIndex, metrics, logsSample: logs.slice(0, 10) };
}

if (!fs.existsSync(storage)) {
  // eslint-disable-next-line no-console
  console.error(`Missing storage: ${storage} — run tests/e2e/scripts/create-cm-storage-state.mjs`);
  process.exit(1);
}

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1));
  if (i < runs - 1) await new Promise((r) => setTimeout(r, 400));
}
await browser.close();

// eslint-disable-next-line no-console
console.log("\n=== R2_M6_CAPTURE_JSON ===\n" + JSON.stringify(results, null, 2) + "\n=== END ===\n");
