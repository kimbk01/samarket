#!/usr/bin/env node
/**
 * Messenger lite client first paint — 3× measurement (Supabase cookie auth).
 * Exit 0 = PASS (3/3 client runs + merge breakdown captured), 1 = FAIL.
 *
 * Baseline: lib/community-messenger/cm-client-first-paint-baseline.json
 * @see docs/messenger-client-first-paint-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);

const BASELINE = JSON.parse(
  fs.readFileSync(
    path.join(root, "lib/community-messenger/cm-client-first-paint-baseline.json"),
    "utf8"
  )
);

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

async function loginCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env.local");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  for (const loginId of LOGIN_IDS) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    return { name: cookieName, value: encodeURIComponent(JSON.stringify(session)) };
  }
  throw new Error("Supabase login failed");
}

function evaluateClientPass(row) {
  if (row.path !== "lite_network") return false;
  if (row.first_row_ms < 0 || row.skeleton_ms < 0 || row.interactive_ms < 0) return false;
  return (
    row.first_row_ms <= BASELINE.response_to_first_room_row_ms &&
    row.skeleton_ms <= BASELINE.response_to_skeleton_removed_ms &&
    row.interactive_ms <= BASELINE.response_to_list_interactive_ms &&
    row.rerenders >= 0 &&
    row.rerenders <= BASELINE.room_list_re_render_max
  );
}

function mergeBreakdownCaptured(merge) {
  if (!merge || typeof merge !== "object") return false;
  return (
    typeof merge.patch_kind === "string" &&
    merge.patch_kind.length > 0 &&
    typeof merge.response_to_merge_start_ms === "number"
  );
}

function formatRow(run, s, apiLiteMs) {
  const d = s.deltas_from_response_ms ?? {};
  const pf = s.pass_fail ?? {};
  const overall = pf
    ? pf.response_to_first_room_row_ms.pass &&
      pf.response_to_skeleton_removed_ms.pass &&
      pf.response_to_list_interactive_ms.pass &&
      pf.room_list_re_render_count.pass
    : false;
  return {
    run,
    path: s.path,
    overall,
    first_row_ms: d.first_room_row_rendered ?? pf?.response_to_first_room_row_ms?.ms ?? -1,
    skeleton_ms: d.skeleton_removed ?? pf?.response_to_skeleton_removed_ms?.ms ?? -1,
    interactive_ms: d.list_interactive ?? pf?.response_to_list_interactive_ms?.ms ?? -1,
    rerenders: s.room_list_re_render_count ?? pf?.room_list_re_render_count?.count ?? -1,
    api_lite_ms: apiLiteMs,
    session_id: s.session_id,
    pass_fail: pf,
  };
}

function parseMergeBreakdownFromText(text) {
  const marker = "[cm-client-merge-breakdown]";
  const idx = text.indexOf(marker);
  const slice = idx >= 0 ? text.slice(idx + marker.length).trim() : text;
  const j = slice.indexOf("{");
  if (j < 0) return null;
  try {
    return JSON.parse(slice.slice(j));
  } catch {
    return null;
  }
}

function parseSessionComplete(text) {
  const j = text.indexOf("{");
  if (j < 0) return null;
  try {
    const o = JSON.parse(text.slice(j));
    if (o.event === "session_complete") return o;
  } catch {
    /* */
  }
  return null;
}

async function readMergeBreakdownFromPage(page) {
  return page.evaluate(() => {
    const frozen = window.__cmClientMergeBreakdownLastPayload;
    if (frozen && typeof frozen === "object" && frozen.patch_kind) return frozen;
    const live = window.__cmClientMergeBreakdownLast?.();
    if (live && typeof live === "object" && live.patch_kind) return live;
    return null;
  });
}

async function measureRun(page, runIndex) {
  const sessionsFromConsole = [];
  const markLogs = [];
  const mergeFromConsole = [];
  const onConsole = (msg) => {
    const t = msg.text();
    if (!t) return;
    if (t.includes("[cm-client-merge-breakdown]")) {
      const parsed = parseMergeBreakdownFromText(t);
      if (parsed) mergeFromConsole.push(parsed);
      return;
    }
    if (!t.includes("[cm-client-first-paint]")) return;
    markLogs.push(t);
    const parsed = parseSessionComplete(t);
    if (parsed) sessionsFromConsole.push(parsed);
  };
  page.on("console", onConsole);

  let apiLiteMs = -1;

  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
      sessionStorage.setItem("samarket:debug:runtime", "1");
      sessionStorage.setItem("samarket:cm:force-lite-network", "1");
      sessionStorage.setItem("samarket:cm:eager-lite-merge", "1");
    } catch {
      /* */
    }
  });

  const liteBootstrapPromise = page.waitForResponse(
    (r) => r.url().includes("/api/community-messenger/bootstrap") && r.url().includes("lite=1"),
    { timeout: 90_000 }
  );

  await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "commit", timeout: 90_000 });

  const bootRes = await liteBootstrapPromise.catch(() => null);
  if (bootRes) {
    const t0 = Date.now();
    await bootRes.finished().catch(() => {});
    apiLiteMs = Math.round(Date.now() - t0);
    const serverMs = await page.evaluate((url) => {
      const entries = performance.getEntriesByName(url);
      const e = entries[entries.length - 1];
      return e && "duration" in e ? Math.round(e.duration) : null;
    }, bootRes.url());
    if (serverMs != null && serverMs > 0) apiLiteMs = serverMs;
  }

  await page.locator('[data-messenger-chat-row="true"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page
    .waitForFunction(
      () => {
        const dump = window.__cmClientFirstPaintDump?.() ?? [];
        return dump.some((s) => s.finalized);
      },
      { timeout: 45_000 }
    )
    .catch(() => null);
  await page
    .waitForFunction(
      () => {
        const p = window.__cmClientMergeBreakdownLastPayload;
        return Boolean(p && typeof p.patch_kind === "string" && p.patch_kind.length > 0);
      },
      { timeout: 20_000 }
    )
    .catch(() => null);
  await page.waitForTimeout(400);

  const dump = await page.evaluate(() => window.__cmClientFirstPaintDump?.() ?? []);
  let mergeBreakdown = mergeFromConsole[mergeFromConsole.length - 1] ?? (await readMergeBreakdownFromPage(page));
  page.off("console", onConsole);

  const finalized = dump.filter((s) => s.finalized);
  const liteSessions = finalized.filter((s) => s.path === "lite_network");
  const session =
    liteSessions[liteSessions.length - 1] ??
    finalized[finalized.length - 1] ??
    sessionsFromConsole.filter((s) => s.path === "lite_network").pop() ??
    sessionsFromConsole[sessionsFromConsole.length - 1] ??
    null;

  if (!session) {
    return {
      run: runIndex,
      path: "none",
      overall: false,
      client_pass: false,
      merge_captured: mergeBreakdownCaptured(mergeBreakdown),
      first_row_ms: -1,
      skeleton_ms: -1,
      interactive_ms: -1,
      rerenders: -1,
      api_lite_ms: apiLiteMs,
      session_id: "missing",
      pass_fail: null,
      merge: mergeBreakdown,
      debug_log_tail: markLogs.slice(-8),
    };
  }

  const normalized =
    session.event === "session_complete"
      ? {
          session_id: session.session_id,
          path: session.path,
          deltas_from_response_ms: session.deltas_from_response_ms,
          room_list_re_render_count: session.room_list_re_render_count,
          pass_fail: session.pass_fail,
          finalized: true,
        }
      : session;

  const row = formatRow(runIndex, normalized, apiLiteMs);
  row.client_pass = evaluateClientPass(row);
  row.merge = mergeBreakdown;
  row.merge_captured = mergeBreakdownCaptured(mergeBreakdown);
  row.overall = row.client_pass && row.merge_captured;
  return row;
}

async function fetchServerLiteTimings(cookie) {
  const timings = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/api/community-messenger/bootstrap?lite=1&fresh=1`, {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
      cache: "no-store",
    });
    timings.push({ run: i + 1, ms: Math.round(Date.now() - t0), status: res.status });
    await res.arrayBuffer().catch(() => null);
    await new Promise((r) => setTimeout(r, 400));
  }
  return timings;
}

async function main() {
  const cookie = await loginCookie();
  const host = new URL(baseUrl).hostname;

  const browser = await chromium.launch({ headless: true });
  const rows = [];
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, domain: host, path: "/" },
    ]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
        sessionStorage.removeItem("samarket.messenger.bootstrap.critical.v1");
        sessionStorage.removeItem("samarket.messenger.bootstrap.minimal.v1");
        sessionStorage.setItem("samarket:debug:runtime", "1");
        sessionStorage.setItem("samarket:cm:force-lite-network", "1");
        sessionStorage.setItem("samarket:cm:eager-lite-merge", "1");
      } catch {
        /* */
      }
    });
    try {
      rows.push(await measureRun(page, run));
    } catch (e) {
      rows.push({
        run,
        path: "error",
        overall: false,
        client_pass: false,
        merge_captured: false,
        first_row_ms: -1,
        skeleton_ms: -1,
        interactive_ms: -1,
        rerenders: -1,
        api_lite_ms: -1,
        session_id: String(e?.message ?? e),
        pass_fail: null,
        merge: null,
      });
    }
    await context.close();
  }

  await browser.close();

  const serverLite = await fetchServerLiteTimings(cookie);
  const serverOverRecommended = serverLite.some((s) => s.ms > BASELINE.server_lite_ms_recommended);

  console.log("\n=== CM client first paint (3 runs) ===\n");
  console.log(
    `Baseline: first_row<=${BASELINE.response_to_first_room_row_ms} skeleton<=${BASELINE.response_to_skeleton_removed_ms} interactive<=${BASELINE.response_to_list_interactive_ms} re_renders<=${BASELINE.room_list_re_render_max} server_lite<=${BASELINE.server_lite_ms_recommended}ms (recommended)\n`
  );
  console.log("| Run | path | PASS | first_row | skeleton | interactive | re_renders | merge | api_lite_ms |");
  console.log("|-----|------|------|-----------|----------|-------------|------------|-------|-------------|");
  for (const r of rows) {
    console.log(
      `| ${r.run} | ${r.path} | ${r.overall ? "PASS" : "FAIL"} | ${r.first_row_ms} | ${r.skeleton_ms} | ${r.interactive_ms} | ${r.rerenders} | ${r.merge_captured ? "ok" : "missing"} | ${r.api_lite_ms} |`
    );
    const m = r.merge;
    if (m) {
      console.log(
        `  merge: merge_start=${m.response_to_merge_start_ms} build=${m.patch_build_ms} apply=${m.patch_apply_ms} store=${m.store_emit_ms} list_render=${m.list_render_ms} stable=${m.bootstrap_reference_stable} overlap=${m.hydration_overlap}`
      );
    }
    if (!r.client_pass) {
      const fails = [];
      if (r.first_row_ms > BASELINE.response_to_first_room_row_ms) fails.push(`first_row>${BASELINE.response_to_first_room_row_ms}`);
      if (r.skeleton_ms > BASELINE.response_to_skeleton_removed_ms) fails.push(`skeleton>${BASELINE.response_to_skeleton_removed_ms}`);
      if (r.interactive_ms > BASELINE.response_to_list_interactive_ms) fails.push(`interactive>${BASELINE.response_to_list_interactive_ms}`);
      if (r.rerenders > BASELINE.room_list_re_render_max) fails.push(`re_renders>${BASELINE.room_list_re_render_max}`);
      if (r.path !== "lite_network") fails.push("no_lite_session");
      console.log(`  fail: ${fails.join(", ")}`);
    } else if (!r.merge_captured) {
      console.log("  fail: merge_breakdown_missing");
    }
    if (r.debug_log_tail?.length) {
      console.log(`  debug: ${r.debug_log_tail.join(" | ").slice(0, 400)}`);
    }
  }

  console.log("\n=== Merge breakdown (3 runs) ===\n");
  console.log(
    "| Run | merge_start | patch_build | patch_apply | store_emit | list_render | first_row | skeleton | interactive | rerender | overlap | stable |"
  );
  console.log(
    "|-----|-------------|-------------|-------------|------------|-------------|-----------|----------|-------------|----------|---------|--------|"
  );
  for (const r of rows) {
    const m = r.merge ?? {};
    console.log(
      `| ${r.run} | ${m.response_to_merge_start_ms ?? "-"} | ${m.patch_build_ms ?? "-"} | ${m.patch_apply_ms ?? "-"} | ${m.store_emit_ms ?? "-"} | ${m.list_render_ms ?? "-"} | ${m.response_to_first_row_ms ?? r.first_row_ms} | ${m.response_to_skeleton_ms ?? r.skeleton_ms} | ${m.response_to_interactive_ms ?? r.interactive_ms} | ${m.rerender_count ?? r.rerenders} | ${m.hydration_overlap ?? "-"} | ${m.bootstrap_reference_stable ?? "-"} |`
    );
  }

  if (serverLite?.length) {
    console.log("\nServer GET ?lite=1&fresh=1 (Node fetch, same cookie):");
    for (const s of serverLite) {
      const tag = s.ms > BASELINE.server_lite_ms_recommended ? " WARN" : "";
      console.log(`  run ${s.run}: ${s.ms}ms HTTP ${s.status}${tag}`);
    }
  }

  const allClientPass = rows.length === 3 && rows.every((r) => r.client_pass);
  const allMergeCaptured = rows.every((r) => r.merge_captured);
  const allPass = allClientPass && allMergeCaptured;

  console.log(`\nClient paint (3/3): ${allClientPass ? "PASS" : "FAIL"}`);
  console.log(`Merge breakdown capture: ${allMergeCaptured ? "PASS" : "FAIL"}`);
  console.log(`Overall: ${allPass ? "PASS" : "FAIL"}`);
  if (serverOverRecommended) {
    console.warn(
      `[cm-client-first-paint-lock] server lite > ${BASELINE.server_lite_ms_recommended}ms recommended (see Node fetch above; does not fail exit)`
    );
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
