#!/usr/bin/env node
/**
 * Messenger parity audit — runs representative messenger E2E probes and ranks one bottleneck.
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=aaaa E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-messenger-parity-audit.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const runs = Math.max(1, Number(process.env.MESSENGER_PARITY_AUDIT_RUNS ?? "3") || 3);
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.SAMARKET_BASE_URL || "http://localhost:3000";
const username = process.env.E2E_TEST_USERNAME || "aaaa";
const password = process.env.E2E_TEST_PASSWORD || "1234";
const includeCallSmoke = process.env.MESSENGER_PARITY_AUDIT_CALL_SMOKE !== "0";
const storageStatePath = path.join(root, "tests", "e2e", ".auth", "cm-storage.json");
const directProbeEnabled = process.env.MESSENGER_PARITY_AUDIT_DIRECT_PROBE !== "0";
const sendProbeEnabled = process.env.MESSENGER_PARITY_AUDIT_SEND_PROBE !== "0";
const e2eSpecsEnabled = process.env.MESSENGER_PARITY_AUDIT_E2E_SPECS !== "0";

const specs = [
  {
    id: "bootstrap",
    file: "tests/e2e/bootstrap-structure-verification.spec.ts",
    marker: "BOOTSTRAP_VERIFICATION_JSON",
    kind: "line",
  },
  {
    id: "scenario",
    file: "tests/e2e/messenger-scenario-perf-capture.spec.ts",
    marker: "MESSENGER_SCENARIO_PERF_JSON",
    kind: "block",
  },
  {
    id: "room_entry",
    file: "tests/e2e/messenger-room-entry-perf-breakdown.spec.ts",
    marker: "MESSENGER_ROOM_ENTRY_PERF_JSON",
    kind: "block",
    extraMarkers: ["MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON", "MESSENGER_ROOM_ENTRY_GATE_GAP_JSON"],
  },
  {
    id: "home_render",
    file: "tests/e2e/messenger-home-render-perf.spec.ts",
    marker: "MESSENGER_RENDER_PERF",
    kind: "block",
  },
  ...(includeCallSmoke
    ? [
        {
          id: "call_smoke",
          file: "tests/e2e/community-messenger-call-smoke.spec.ts",
          marker: null,
          kind: "status",
        },
      ]
    : []),
];

function parseJsonAt(text, startIndex) {
  const jsonStart = text.indexOf("{", startIndex);
  if (jsonStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function ensureStorageState() {
  if (process.env.MESSENGER_PARITY_AUDIT_SKIP_STORAGE_STATE === "1") {
    return process.env.PLAYWRIGHT_STORAGE_STATE || "";
  }
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return process.env.PLAYWRIGHT_STORAGE_STATE || "";
  }
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return process.env.PLAYWRIGHT_STORAGE_STATE || "";
  const candidates = [
    username.includes("@") ? username : `${username}@manual.local`,
    username.includes("@") ? username : `${username}@samarket.local`,
    username,
  ];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  let usedEmail = "";
  for (const email of candidates) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      session = data.session;
      usedEmail = email;
      break;
    }
  }
  if (!session) {
    return process.env.PLAYWRIGHT_STORAGE_STATE || "";
  }
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  const origin = new URL(baseUrl);
  const cookie = {
    name: `sb-${ref}-auth-token`,
    value: cookieValue,
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(
    storageStatePath,
    `${JSON.stringify({ cookies: [cookie], origins: [] }, null, 2)}\n`,
    "utf8"
  );
  console.log(`Prepared Playwright storage state for ${usedEmail}: ${path.relative(root, storageStatePath)}`);
  return storageStatePath;
}

function parseLineMarker(text, marker) {
  const idx = text.lastIndexOf(`${marker}:`);
  if (idx < 0) return null;
  return parseJsonAt(text, idx + marker.length + 1);
}

function parseBlockMarker(text, marker) {
  const idx = text.lastIndexOf(marker);
  if (idx < 0) return null;
  return parseJsonAt(text, idx + marker.length);
}

function parseMarker(text, spec) {
  if (!spec.marker) return null;
  return spec.kind === "line" ? parseLineMarker(text, spec.marker) : parseBlockMarker(text, spec.marker);
}

function runSpec(spec, run) {
  const env = {
    ...process.env,
    PLAYWRIGHT_NO_WEBSERVER: process.env.PLAYWRIGHT_NO_WEBSERVER || "1",
    PLAYWRIGHT_BASE_URL: baseUrl,
    E2E_TEST_USERNAME: username,
    E2E_TEST_PASSWORD: password,
    BOOTSTRAP_VERIFICATION_LABEL: `audit_run_${run}`,
    PLAYWRIGHT_STORAGE_STATE: process.env.PLAYWRIGHT_STORAGE_STATE || storageStatePath,
  };
  const proc = spawnSync("npx", ["playwright", "test", spec.file, "--workers=1"], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 30 * 1024 * 1024,
  });
  const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
  const parsed = parseMarker(output, spec);
  const extra = {};
  for (const marker of spec.extraMarkers ?? []) {
    extra[marker] = parseLineMarker(output, marker);
  }
  return {
    id: spec.id,
    file: spec.file,
    run,
    ok: proc.status === 0,
    exitCode: proc.status ?? 1,
    parsed,
    extra,
    outputTail: output.slice(-6000),
  };
}

async function runDirectProbe(run) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: process.env.PLAYWRIGHT_STORAGE_STATE || storageStatePath });
  const page = await context.newPage();
  const responses = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 500)));
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/community-messenger")) return;
    responses.push({ url, status: res.status(), method: res.request().method(), at: Date.now() });
  });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
      sessionStorage.removeItem("samarket.messenger.bootstrap.critical.v1");
      sessionStorage.removeItem("samarket.messenger.bootstrap.minimal.v1");
      sessionStorage.removeItem("samarket:cm:initial-foreground-bootstrap:v1");
    } catch {
      /* ignore */
    }
  });

  const homeStart = Date.now();
  let homeReadyMs = null;
  let roomReadyMs = null;
  let ack = null;
  let parsed = null;
  let firstRoomHref = "";
  let homeStateAtReady = null;
  try {
    await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page
      .locator('[data-messenger-chat-row="true"]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    homeReadyMs = Date.now() - homeStart;
    homeStateAtReady = await page.evaluate(() => {
      const snap = window.getMessengerHomeVerificationSnapshot?.() ?? null;
      return {
        failed: document.body.innerText.includes("Failed to load messenger"),
        rows: document.querySelectorAll('[data-messenger-chat-row="true"]').length,
        room_links: document.querySelectorAll('a[href^="/community-messenger/rooms/"]').length,
        bootstrap_fetch: snap?.bootstrapClientNetworkFetch ?? null,
        app_wide_phase_last_ms: snap?.appWidePhaseLastMs ?? null,
        render_perf: snap?.messengerRenderPerf ?? null,
        debug_events: snap?.messengerHomeDebugEvents ?? null,
      };
    });
    firstRoomHref = await page
      .evaluate(() => {
        const link = document.querySelector(
          '[data-messenger-chat-row="true"] a[href*="/community-messenger/rooms/"]'
        );
        if (link?.href) return link.href;
        const snap = window.getMessengerHomeVerificationSnapshot?.() ?? null;
        void snap;
        return "";
      })
      .catch(() => "");
    if (!firstRoomHref) {
      const boot = await page
        .request
        .get(`${baseUrl}/api/community-messenger/bootstrap?lite=1`, { timeout: 45_000 })
        .then((res) => res.json())
        .catch(() => null);
      const roomId = boot?.chats?.find?.((room) => typeof room?.id === "string" && room.id.trim())?.id;
      if (roomId) firstRoomHref = `${baseUrl}/community-messenger/rooms/${encodeURIComponent(roomId)}`;
    }
    const beforeRoom = Date.now();
    if (!firstRoomHref) throw new Error("no_room_href_for_direct_probe");
    await page.goto(firstRoomHref, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
    await page.locator("textarea").first().waitFor({ state: "visible", timeout: 45_000 });
    roomReadyMs = Date.now() - beforeRoom;
    if (sendProbeEnabled) {
      const textarea = page.locator("textarea").first();
      await textarea.fill(`audit-probe-${Date.now()}`);
      const resP = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().includes("/api/community-messenger/rooms/") &&
          r.url().includes("/messages") &&
          !r.url().includes("/sticker"),
        { timeout: 45_000 }
      );
      const t0 = Date.now();
      await page.locator("footer button:not([disabled])").last().click();
      const res = await resP;
      ack = { ack_ms: Date.now() - t0, status: res.status() };
    }
  } catch (error) {
    errors.push(String(error).slice(0, 700));
  } finally {
    parsed = await page
      .evaluate(
        ({ homeReadyMs, roomReadyMs, ack, responses, errors, firstRoomHref, homeStateAtReady }) => {
          const snap = window.getMessengerHomeVerificationSnapshot?.() ?? null;
          const homeSnap = homeStateAtReady ?? {
            failed: document.body.innerText.includes("Failed to load messenger"),
            rows: document.querySelectorAll('[data-messenger-chat-row="true"]').length,
            room_links: document.querySelectorAll('a[href^="/community-messenger/rooms/"]').length,
            bootstrap_fetch: snap?.bootstrapClientNetworkFetch ?? null,
            app_wide_phase_last_ms: snap?.appWidePhaseLastMs ?? null,
            render_perf: snap?.messengerRenderPerf ?? null,
            debug_events: snap?.messengerHomeDebugEvents ?? null,
          };
          return {
            home: {
              ready_ms: homeReadyMs,
              ...homeSnap,
            },
            room: {
              ready_ms: roomReadyMs,
              url: location.href,
              target_href: firstRoomHref,
              textarea_visible: Boolean(document.querySelector("textarea")),
            },
            ack,
            network: {
              bootstrap_get_count: responses.filter((r) => r.method === "GET" && r.url.includes("/bootstrap")).length,
              home_bootstrap_get_count: responses.filter(
                (r) =>
                  r.method === "GET" &&
                  r.url.includes("/api/community-messenger/bootstrap") &&
                  !r.url.includes("/rooms/") &&
                  !r.url.includes("callsLog=")
              ).length,
              home_bootstrap_client_fetch_total:
                (homeSnap.bootstrap_fetch?.critical ?? 0) +
                (homeSnap.bootstrap_fetch?.lite ?? 0) +
                (homeSnap.bootstrap_fetch?.full ?? 0) +
                (homeSnap.bootstrap_fetch?.fresh ?? 0),
              room_bootstrap_get_count: responses.filter(
                (r) =>
                  r.method === "GET" &&
                  r.url.includes("/api/community-messenger/rooms/") &&
                  r.url.includes("/bootstrap")
              ).length,
              message_post_count: responses.filter((r) => r.method === "POST" && r.url.includes("/messages")).length,
              statuses: responses.map((r) => r.status),
            },
            errors,
          };
        },
        { homeReadyMs, roomReadyMs, ack, responses, errors, firstRoomHref, homeStateAtReady }
      )
      .catch((error) => ({ errors: [...errors, `final_evaluate_failed:${String(error).slice(0, 700)}`] }));
    await context.close();
    await browser.close();
  }
  return {
    id: "direct_probe",
    file: "playwright-direct-probe",
    run,
    ok: Boolean(parsed?.home?.rows) && parsed?.home?.failed !== true,
    exitCode: Boolean(parsed?.home?.rows) && parsed?.home?.failed !== true ? 0 : 1,
    parsed,
    extra: {},
    outputTail: "",
  };
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function median(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function avg(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function collect(specResults, id) {
  return specResults.filter((r) => r.id === id && r.parsed);
}

function buildSummary(results) {
  const bootstrapRows = collect(results, "bootstrap").map((r) => r.parsed);
  const directRows = collect(results, "direct_probe").map((r) => r.parsed);
  const scenarioRows = collect(results, "scenario").map((r) => r.parsed);
  const roomEntryRows = collect(results, "room_entry").map((r) => r.parsed);
  const prefmrRows = results
    .filter((r) => r.id === "room_entry" && r.extra?.MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON)
    .map((r) => r.extra.MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON);
  const homeRows = collect(results, "home_render").map((r) => r.parsed);
  const callRows = results.filter((r) => r.id === "call_smoke");

  const bootstrapChatRows = bootstrapRows.map((row) => row.chat ?? {});
  const ackRows = bootstrapRows.map((row) => row.ack ?? {});
  const scenarioRoomFirst = scenarioRows.map((row) => row.roomFirst ?? {});
  const scenarioRoomReenter = scenarioRows.map((row) => row.roomReenter ?? {});

  const metrics = {
    bootstrap: {
      runs: bootstrapRows.length,
      composer_wall_ms_avg: round(avg(bootstrapChatRows.map((r) => num(r.composer_wall_ms)))),
      room_bootstrap_get_count_avg: round(avg(bootstrapChatRows.map((r) => num(r.room_bootstrap_get_count)))),
      list_prefetch_get_count_avg: round(avg(bootstrapChatRows.map((r) => num(r.room_bootstrap_prefetch_get_count)))),
      room_client_block_get_count_avg: round(avg(bootstrapChatRows.map((r) => num(r.room_bootstrap_room_client_block_get_count)))),
      primed_followup_get_count_avg: round(avg(bootstrapChatRows.map((r) => num(r.room_bootstrap_room_client_primed_followup_get_count)))),
      legacy_get_count_avg: round(
        avg(
          bootstrapChatRows.map((r) =>
            (num(r.room_bootstrap_room_client_legacy_tag_get_count) ?? 0) +
            (num(r.room_bootstrap_room_client_bare_legacy_get_count) ?? 0) +
            (num(r.room_bootstrap_legacy_absent_cm_req_src_get_count) ?? 0)
          )
        )
      ),
      ack_ms_avg: round(avg(ackRows.map((r) => num(r.ack_ms)))),
      ack_ms_worst: round(Math.max(0, ...ackRows.map((r) => num(r.ack_ms) ?? 0))),
    },
    scenario: {
      runs: scenarioRows.length,
      room_first_bootstrap_network_ms_avg: round(
        avg(scenarioRoomFirst.map((r) => num(r.messenger_bootstrap_fetch_network_ms)))
      ),
      room_reenter_bootstrap_network_ms_avg: round(
        avg(scenarioRoomReenter.map((r) => num(r.messenger_bootstrap_fetch_network_ms)))
      ),
      keydown_to_commit_ms_avg: round(
        avg(
          scenarioRows.flatMap((row) => [
            num(row.afterOneChar?.keydown_to_commit_ms),
            num(row.afterSeq?.keydown_to_commit_ms),
            num(row.afterPaste?.keydown_to_commit_ms),
          ])
        )
      ),
    },
    room_entry: {
      runs: roomEntryRows.length,
      first_message_render_ms_avg: round(avg(roomEntryRows.map((r) => num(r.messenger_room_entry_first_message_render_ms)))),
      display_to_first_message_ms_avg: round(avg(prefmrRows.map((r) => num(r.winner?.ms)))),
      prefmr_winner_names: prefmrRows.map((r) => r.winner?.name).filter(Boolean),
    },
    home_render: {
      runs: homeRows.length,
      home_render_count_median: round(median(homeRows.map((r) => num(r.messengerRenderPerf?.messenger_home_render)))),
      room_row_render_count_median: round(median(homeRows.map((r) => num(r.messengerRenderPerf?.messenger_room_row_render)))),
    },
    call_smoke: {
      runs: callRows.length,
      pass_count: callRows.filter((r) => r.ok).length,
    },
    direct_probe: {
      runs: directRows.length,
      home_ready_ms_avg: round(avg(directRows.map((r) => num(r.home?.ready_ms)))),
      room_ready_ms_avg: round(avg(directRows.map((r) => num(r.room?.ready_ms)))),
      ack_ms_avg: round(avg(directRows.map((r) => num(r.ack?.ack_ms)))),
      bootstrap_get_count_avg: round(avg(directRows.map((r) => num(r.network?.bootstrap_get_count)))),
      home_bootstrap_get_count_avg: round(avg(directRows.map((r) => num(r.network?.home_bootstrap_get_count)))),
      home_bootstrap_client_fetch_total_avg: round(
        avg(directRows.map((r) => num(r.network?.home_bootstrap_client_fetch_total)))
      ),
      room_bootstrap_get_count_avg: round(avg(directRows.map((r) => num(r.network?.room_bootstrap_get_count)))),
      rows_min: directRows.length ? Math.min(...directRows.map((r) => num(r.home?.rows) ?? 0)) : null,
      failed_count: directRows.filter((r) => r.home?.failed === true).length,
    },
  };

  const findings = [];
  const prefetchAvg = metrics.bootstrap.list_prefetch_get_count_avg ?? 0;
  const blockAvg = metrics.bootstrap.room_client_block_get_count_avg ?? 0;
  const primedAvg = metrics.bootstrap.primed_followup_get_count_avg ?? 0;
  if (prefetchAvg > 0 && blockAvg > 0) {
    findings.push({
      id: "prefetch_blocking_bootstrap_duplicate",
      priority: 100 + Math.round((prefetchAvg + blockAvg + primedAvg) * 10),
      title: "list_prefetch 후 room_client_block bootstrap이 다시 발생",
      evidence: {
        list_prefetch_get_count_avg: prefetchAvg,
        room_client_block_get_count_avg: blockAvg,
        primed_followup_get_count_avg: primedAvg,
      },
      suggested_files: [
        "lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client.ts",
        "lib/community-messenger/room-snapshot-cache.ts",
      ],
    });
  }
  if ((metrics.bootstrap.ack_ms_avg ?? 0) > 200) {
    findings.push({
      id: "message_send_ack_slow",
      priority: 80 + Math.round((metrics.bootstrap.ack_ms_avg ?? 0) / 10),
      title: "메시지 전송 ACK가 목표 200ms를 초과",
      evidence: { ack_ms_avg: metrics.bootstrap.ack_ms_avg, ack_ms_worst: metrics.bootstrap.ack_ms_worst },
      suggested_files: ["app/api/community-messenger/rooms/[roomId]/messages/route.ts"],
    });
  }
  if ((metrics.room_entry.display_to_first_message_ms_avg ?? 0) > 100) {
    findings.push({
      id: "message_render_after_display_ready_slow",
      priority: 60 + Math.round((metrics.room_entry.display_to_first_message_ms_avg ?? 0) / 10),
      title: "displayRoomMessages 준비 후 첫 말풍선 렌더가 목표 100ms를 초과",
      evidence: { display_to_first_message_ms_avg: metrics.room_entry.display_to_first_message_ms_avg },
      suggested_files: ["components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"],
    });
  }
  if ((metrics.scenario.keydown_to_commit_ms_avg ?? 0) > 16) {
    findings.push({
      id: "input_commit_frame_budget",
      priority: 50 + Math.round((metrics.scenario.keydown_to_commit_ms_avg ?? 0) / 5),
      title: "입력 keydown→commit이 16ms 프레임 예산을 초과",
      evidence: { keydown_to_commit_ms_avg: metrics.scenario.keydown_to_commit_ms_avg },
      suggested_files: ["components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"],
    });
  }
  if (metrics.call_smoke.runs > 0 && metrics.call_smoke.pass_count < metrics.call_smoke.runs) {
    findings.push({
      id: "call_smoke_failure",
      priority: 70,
      title: "통화 smoke 검증 실패",
      evidence: metrics.call_smoke,
      suggested_files: ["components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx"],
    });
  }
  if ((metrics.direct_probe.failed_count ?? 0) > 0 || (metrics.direct_probe.rows_min ?? 0) <= 0) {
    findings.push({
      id: "messenger_home_first_entry_failed",
      priority: 140,
      title: "메신저 홈 첫 진입이 성공 bootstrap 후에도 실패 화면으로 고정",
      evidence: metrics.direct_probe,
      suggested_files: [
        "lib/community-messenger/warm-messenger-list-bootstrap-client.ts",
        "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts",
      ],
    });
  } else if (
    (metrics.direct_probe.home_bootstrap_client_fetch_total_avg ??
      metrics.direct_probe.home_bootstrap_get_count_avg ??
      0) > 2
  ) {
    findings.push({
      id: "messenger_home_duplicate_bootstrap_fetch",
      priority:
        90 +
        Math.round(
          (metrics.direct_probe.home_bootstrap_client_fetch_total_avg ??
            metrics.direct_probe.home_bootstrap_get_count_avg ??
            0) * 5
        ),
      title: "메신저 홈 첫 진입에서 bootstrap GET이 중복 발생",
      evidence: metrics.direct_probe,
      suggested_files: [
        "lib/community-messenger/cm-bootstrap-client-fetch.ts",
        "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts",
      ],
    });
  }

  findings.sort((a, b) => b.priority - a.priority);
  return { metrics, findings, topFinding: findings[0] ?? null };
}

console.log("\n=== Messenger Parity Audit ===\n");
console.log({ baseUrl, runs, username, includeCallSmoke });

await ensureStorageState();

const results = [];
for (let run = 1; run <= runs; run += 1) {
  console.log(`\n--- audit run ${run}/${runs} ---`);
  if (directProbeEnabled) {
    console.log("\n[direct_probe] playwright direct probe");
    const direct = await runDirectProbe(run);
    results.push(direct);
    console.log(`status=${direct.ok ? "PASS" : "FAIL"} rows=${direct.parsed?.home?.rows ?? 0} failed=${direct.parsed?.home?.failed}`);
  }
  if (run < runs) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (e2eSpecsEnabled) {
    for (const spec of specs) {
      console.log(`\n[${spec.id}] ${spec.file}`);
      const result = runSpec(spec, run);
      results.push(result);
      console.log(`status=${result.ok ? "PASS" : "FAIL"} exit=${result.exitCode} parsed=${Boolean(result.parsed)}`);
      if (!result.ok && result.outputTail) {
        console.log(result.outputTail.slice(-1200));
      }
    }
  }
}

const summary = buildSummary(results);
const out = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  runs,
  specs: [...(directProbeEnabled ? ["direct_probe"] : []), ...(e2eSpecsEnabled ? specs.map((s) => s.id) : [])],
  results: results.map((r) => ({
    id: r.id,
    run: r.run,
    ok: r.ok,
    exitCode: r.exitCode,
    parsed: Boolean(r.parsed),
    ...(r.id === "direct_probe" ? { direct: r.parsed } : {}),
    extraParsed: Object.fromEntries(Object.entries(r.extra ?? {}).map(([k, v]) => [k, Boolean(v)])),
  })),
  ...summary,
};

const outputPath = process.env.MESSENGER_PARITY_AUDIT_OUTPUT
  ? path.resolve(root, process.env.MESSENGER_PARITY_AUDIT_OUTPUT)
  : path.join(root, "docs", "perf", "messenger-parity-audit-latest.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

console.log("\n=== MESSENGER_PARITY_AUDIT_JSON ===");
console.log(JSON.stringify(out, null, 2));
console.log("=== END ===\n");
console.log(`Wrote ${path.relative(root, outputPath)}`);

const parsedCount = results.filter((r) => r.parsed || r.id === "call_smoke").length;
if (parsedCount === 0) {
  console.error("No messenger audit metrics were captured.");
  process.exit(1);
}
process.exit(0);
