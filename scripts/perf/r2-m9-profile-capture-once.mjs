/**
 * R2-M9 — room entry 218ms 단계 분해 (측정 전용).
 * node scripts/perf/r2-m9-profile-capture-once.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storage = path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
const runs = Number(process.env.R2_M9_RUNS || "3");

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickSnap(phases, key) {
  return num(phases[key] ?? null);
}

const LIST_STAGES = [
  "list_nav_begin",
  "route_push",
  "route_layout_mount",
  "route_page_mount",
  "suspense_release",
  "page_client_probe",
  "room_client_wrapper_render",
  "composer_early_module_eval",
  "composer_early_layout_commit",
  "inner_chunk_eval",
  "inner_first_render",
  "phase1_hook_start",
  "phase1_provider_render",
  "phase2_shell_layout_commit",
  "composer_subtree_mount",
  "composer_react_commit_end",
  "textarea_dom_attach",
  "textarea_visible",
  "layout_after_textarea_raf2",
  "first_interactive",
];

function buildBreakdown(phases) {
  const list = {};
  const route = {};
  for (const s of LIST_STAGES) {
    list[s] = pickSnap(phases, `r2m9_list_${s}_ms`) ?? pickSnap(phases, `messenger_room_entry_r2m9_list_${s}_ms`);
    route[s] = pickSnap(phases, `r2m9_route_${s}_ms`) ?? pickSnap(phases, `messenger_room_entry_route_${s}_ms`);
  }
  const legacy = {
    input_ready_ms: pickSnap(phases, "messenger_room_entry_input_ready_ms"),
    composer_mount_done_ms: pickSnap(phases, "messenger_room_entry_composer_mount_done_ms"),
  };
  const metrics = {
    dom_nodes_before_composer: pickSnap(phases, "r2m9_dom_nodes_before_composer"),
    dom_cm_room_nodes_before_composer: pickSnap(phases, "r2m9_dom_cm_room_nodes_before_composer"),
    sync_composer_early_render_ms: pickSnap(phases, "r2m9_sync_composer_early_render_ms"),
    sync_composer_subtree_layout_ms: pickSnap(phases, "r2m9_sync_composer_subtree_layout_ms"),
    layout_reflow_after_textarea_ms: pickSnap(phases, "r2m9_layout_reflow_after_textarea_ms"),
  };
  const deltasList = {};
  const ordered = LIST_STAGES.filter((s) => list[s] != null);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    deltasList[`${prev}→${cur}`] = list[cur] - list[prev];
  }
  const deltasRoute = {};
  const orderedR = LIST_STAGES.filter((s) => route[s] != null);
  for (let i = 1; i < orderedR.length; i += 1) {
    const prev = orderedR[i - 1];
    const cur = orderedR[i];
    deltasRoute[`${prev}→${cur}`] = route[cur] - route[prev];
  }
  const textareaListMs = list.textarea_visible ?? legacy.input_ready_ms;
  const gap =
    textareaListMs != null && route.route_page_mount != null
      ? textareaListMs - route.route_page_mount
      : null;
  return { list, route, legacy, metrics, deltasList, deltasRoute, list_minus_route_textarea_gap_ms: gap };
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
    if (t.includes("[R2-M9-PROFILE]") || t.includes("r2-m9") || t.includes("messenger_room_entry")) {
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
  await page.waitForTimeout(600);

  const phases = await page.evaluate(() => {
    const w = window;
    return w.getMessengerHomeVerificationSnapshot?.()?.appWidePhaseLastMs ?? {};
  });

  let profileJson = null;
  for (const line of logs) {
    const idx = line.indexOf("[R2-M9-PROFILE]");
    if (idx < 0) continue;
    const raw = line.slice(idx + "[R2-M9-PROFILE]".length).trim();
    try {
      profileJson = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }

  await context.close();
  return { runIndex, breakdown: buildBreakdown(phases), profileJson, logsSample: logs.slice(-5) };
}

if (!fs.existsSync(storage)) {
  // eslint-disable-next-line no-console
  console.error(`Missing storage: ${storage}`);
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
console.log("\n=== R2_M9_PROFILE_JSON ===\n" + JSON.stringify(results, null, 2) + "\n=== END ===\n");
