#!/usr/bin/env node
/**
 * Trade+community checksheet §1 — 3-run audit (당근급 체크시트 증거).
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=qqqq E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-trade-checksheet-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycles = Math.max(1, Number(process.env.TRADE_CHECKSHEET_CYCLES ?? "3") || 3);
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const outPath =
  process.env.TRADE_CHECKSHEET_OUT || path.join(root, "docs", "perf", "trade-checksheet-audit-latest.json");
const PERMISSION_GUIDE_PRESEED_KINDS = ["location", "microphone", "speaker"];
const E2E_TRADE_PHASE_KEY = "samarket:debug:e2e:tradeC2cPhaseLastMs";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInSession() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const hostname = new URL(baseUrl).hostname;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME?.trim(), "qqqq", "aaaa"].filter(Boolean);
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    const cookies = [
      {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: hostname,
        path: "/",
        sameSite: "Lax",
        secure: baseUrl.startsWith("https:"),
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: hostname,
          path: "/",
          sameSite: "Lax",
          secure: baseUrl.startsWith("https:"),
        });
      }
    }
    return { cookies, email };
  }
  throw new Error("signIn failed");
}

function pickMs(snap, key) {
  const v = snap?.appWidePhaseLastMs?.[key] ?? snap?.e2eTradePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

async function readSnap(page) {
  return page.evaluate((sessionKey) => {
    let e2eTradePhaseLastMs = null;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) e2eTradePhaseLastMs = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const base = window.getMessengerHomeVerificationSnapshot?.() ?? null;
    if (!base) return e2eTradePhaseLastMs ? { e2eTradePhaseLastMs, appWidePhaseLastMs: {} } : null;
    return { ...base, e2eTradePhaseLastMs: e2eTradePhaseLastMs ?? {} };
  }, E2E_TRADE_PHASE_KEY);
}

function summarize(samples) {
  if (!samples.length) return { count: 0, min: null, max: null, avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, n) => a + n, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
  };
}

async function dismissPermissionGuides(page) {
  const later = page.getByRole("button", { name: /^나중에$|^Later$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await later.first().isVisible({ timeout: 1200 }).catch(() => false))) break;
    await later.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

async function waitPostH2(page, startAt) {
  await page.locator("h2").first().waitFor({ state: "visible", timeout: 45_000 });
  const wallMs = Date.now() - startAt;
  await page.waitForTimeout(400);
  const snap = await readSnap(page);
  return {
    tap_to_h2_wall_ms: wallMs,
    trade_detail_total_ms: pickMs(snap, "trade_detail_total_ms"),
  };
}

async function runCycle(page, cycleIndex) {
  const row = { cycle: cycleIndex + 1, checksheet: {} };

  // §1 list → detail (prefetch 4s)
  // waitUntil load는 App Router soft nav에서 안 끝나 timeout 남 → commit/domcontentloaded 사용
  await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (cycleIndex === 0) await page.waitForTimeout(2000);
  await dismissPermissionGuides(page);
  const postLink = page.locator('a[href^="/post/"]').first();
  await postLink.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(4000);
  const tapAt = Date.now();
  // soft nav는 click 중에 URL이 바뀌므로 waitForURL을 click과 병렬로 건다 (이후 등록 시 이미 끝난 nav를 놓침)
  await Promise.all([
    page.waitForURL(/\/post\//, { timeout: 45_000, waitUntil: "commit" }),
    postLink.click(),
  ]);
  row.checksheet.list_to_detail = await waitPostH2(page, tapAt);

  // §4 reentry — back → same post
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 45_000 });
  await postLink.waitFor({ state: "visible", timeout: 45_000 });
  const reAt = Date.now();
  await Promise.all([
    page.waitForURL(/\/post\//, { timeout: 45_000, waitUntil: "commit" }),
    postLink.click(),
  ]);
  row.checksheet.detail_reentry = await waitPostH2(page, reAt);

  // §2 chat open
  const chatBtn = page.getByRole("button", { name: /채팅하기|채팅 이어가기|Chat/i }).first();
  if (await chatBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    const chatAt = Date.now();
    await Promise.all([
      Promise.race([
        page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 60_000, waitUntil: "commit" }),
        page.waitForURL(/\/mypage\/trade\/chat\/compose/, { timeout: 60_000, waitUntil: "commit" }),
      ]),
      chatBtn.click(),
    ]);
    await page.locator("textarea").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const snap = await readSnap(page);
    row.checksheet.detail_to_chat = {
      click_to_textarea_wall_ms: Date.now() - chatAt,
      trade_chat_open_total_ms: pickMs(snap, "trade_chat_open_total_ms"),
      chat_click_to_room_ready_ms: pickMs(snap, "chat_click_to_room_ready_ms"),
    };
  }

  // §5 tab — /market bottom nav from philife (cross-domain Confirm 가능)
  await page.goto(`${baseUrl}/philife`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1200);
  // role name /거래|Trade/ 는 모호할 수 있음 → 하단 nav href 고정 (tab id = home)
  const marketTab = page.locator('nav[aria-label="Main navigation"] a[href="/market"]');
  await marketTab.waitFor({ state: "visible", timeout: 45_000 });
  await marketTab.click();
  const dialog = page.getByRole("dialog");
  const hasConfirm = await dialog.isVisible({ timeout: 1500 }).catch(() => false);
  let confirmed = false;
  const tabAt = Date.now();
  if (hasConfirm) {
    const confirmBtn = dialog.getByRole("button", {
      name: /Confirm switch|확인|Confirm/i,
    });
    await confirmBtn.waitFor({ state: "visible", timeout: 4000 });
    confirmed = true;
    await Promise.all([
      page.waitForURL(/\/market\/?(\?|$)/, { timeout: 45_000, waitUntil: "commit" }),
      confirmBtn.click(),
    ]);
  } else {
    await page.waitForURL(/\/market\/?(\?|$)/, { timeout: 45_000, waitUntil: "commit" });
  }
  await page.locator('a[href^="/post/"]').first().waitFor({ state: "visible", timeout: 45_000 });
  row.checksheet.tab_to_market_list_ms = Date.now() - tabAt;
  row.checksheet.tab_domain_confirm_used = confirmed;

  // §3 scroll sample — wheel on market list
  const scrollStart = Date.now();
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(80);
  }
  row.checksheet.list_scroll_wheel_ms = Date.now() - scrollStart;

  return row;
}

async function main() {
  const auth = await signInSession();
  console.log(`auth: ${auth.email}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(auth.cookies);
  await context.addInitScript((kinds) => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      localStorage.setItem("samarket.app.language", "ko");
      for (const k of kinds) localStorage.setItem(`dibay.permission.${k}.guideSeen`, "1");
    } catch {
      /* ignore */
    }
  }, PERMISSION_GUIDE_PRESEED_KINDS);
  const page = await context.newPage();
  const rows = [];
  const errors = [];
  try {
    for (let c = 0; c < cycles; c += 1) {
      try {
        rows.push(await runCycle(page, c));
      } catch (error) {
        errors.push({ cycle: c + 1, message: String(error).slice(0, 500) });
      }
    }
  } finally {
    await browser.close();
  }

  const warm = rows.slice(1);
  const pickWarm = (fn) => summarize(warm.map(fn).filter((n) => n != null));

  const report = {
    measured_at: new Date().toISOString(),
    base_url: baseUrl,
    cycles,
    warm_discard: "cycle 1",
    checksheet_summary: {
      s1_list_to_detail_wall_warm: pickWarm((r) => r.checksheet.list_to_detail?.tap_to_h2_wall_ms),
      s1_trade_detail_server_warm: pickWarm((r) => r.checksheet.list_to_detail?.trade_detail_total_ms),
      s2_chat_to_textarea_warm: pickWarm((r) => r.checksheet.detail_to_chat?.click_to_textarea_wall_ms),
      s4_detail_reentry_wall_warm: pickWarm((r) => r.checksheet.detail_reentry?.tap_to_h2_wall_ms),
      s5_philife_to_market_tab_warm: pickWarm((r) => r.checksheet.tab_to_market_list_ms),
      s3_list_scroll_wheel_warm: pickWarm((r) => r.checksheet.list_scroll_wheel_ms),
    },
    gates: {
      s1_warm_wall_p95_le_1200: null,
      s2_warm_chat_p95_le_1500: null,
      s4_warm_reentry_p95_le_800: null,
      s5_warm_tab_p95_le_2000: null,
    },
    cycles_detail: rows,
    errors,
    structural_lock: [
      "verify:trade-hot-path-contract",
      "verify:trade-primary-tab-transition",
      "P1 related Suspense",
      "BN7 pending enter panel",
      "openCreateTradeChat 비대기",
    ],
  };

  const s = report.checksheet_summary;
  report.gates.s1_warm_wall_p95_le_1200 = s.s1_list_to_detail_wall_warm.p95 != null && s.s1_list_to_detail_wall_warm.p95 <= 1200;
  report.gates.s2_warm_chat_p95_le_1500 = s.s2_chat_to_textarea_warm.p95 != null && s.s2_chat_to_textarea_warm.p95 <= 1500;
  report.gates.s4_warm_reentry_p95_le_800 = s.s4_detail_reentry_wall_warm.p95 != null && s.s4_detail_reentry_wall_warm.p95 <= 800;
  report.gates.s5_warm_tab_p95_le_2000 = s.s5_philife_to_market_tab_warm.p95 != null && s.s5_philife_to_market_tab_warm.p95 <= 2000;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("TRADE_CHECKSHEET_AUDIT_JSON:", JSON.stringify(report));
  process.exit(errors.length && !rows.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
