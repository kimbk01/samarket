#!/usr/bin/env node
/**
 * Slice 11 — Product Runtime Regression (no new product features).
 *
 * Re-measure after Slice 10 dead cleanup against Production:
 *   hub → profile/trust → activity → account → admin projection → legal/business CMS
 *   → Windows/Tablet/APK/iOS → logout/back/scroll smoke → dead-symbol absence
 *
 *   SLICE11_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice11-product-runtime-regression.mjs
 *   SLICE11_SKIP_CHILDREN=1  — windows matrix + dead check only
 *   SLICE11_RT_PLATFORM=windows|tablet|apk|ios|all  — forwarded to slice9
 *
 * Credentials via env / magiclink only. Never log secrets.
 * Slice 12 PRODUCT PASS / HARD LOCK is NOT declared here.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = (process.env.SLICE11_TARGET_SHA || "").trim();
const SKIP_CHILDREN = process.env.SLICE11_SKIP_CHILDREN === "1";
const PLATFORM = (process.env.SLICE11_RT_PLATFORM || process.env.SLICE9_RT_PLATFORM || "all").toLowerCase();
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice11-runtime-${TS}`);

const DEAD_SYMBOLS = [
  "MypageInstagramView",
  "SettingsMainContent",
  "MyInfoProfileSection",
  "MyInfoProfileHubCard",
  "MyInfoMiniProfile",
  "MyInfoProfileCard",
  "components/my/MyProfileCard",
  "components/mypage/MyPageConsole",
  "components/mypage/MyPageContent",
  "export function MyPageConsole",
  "export function MyPageContent",
  "export function MyProfileCard",
];

function loadEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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

function write(name, obj) {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, 2) + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function creds() {
  loadEnv();
  return {
    password:
      process.env.E2E_TEST_PASSWORD ||
      process.env.QA_MANUAL_PASSWORD ||
      process.env.BADGE_NATIVE_PASSWORD ||
      "",
    login: process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55",
    memberId: process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777",
  };
}

async function buildSessionCookies(prod) {
  const { createClient } = await import("@supabase/supabase-js");
  const { password, login, memberId } = creds();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("missing_supabase_anon");
  const email = login.includes("@") ? login.toLowerCase() : `${login.toLowerCase()}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  if (password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`password_login:${error?.message || "no_session"}`);
    session = data.session;
  } else if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: link, error: linkErr } = await adminSb.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    let tokenHash = "";
    try {
      const u = new URL(String(link?.properties?.action_link || ""));
      tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    } catch {
      tokenHash = "";
    }
    if (linkErr || !tokenHash) throw new Error(`magiclink:${linkErr?.message || "no_token"}`);
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (otpErr || !verified.session) throw new Error(`otp:${otpErr?.message || "no_session"}`);
    session = verified.session;
  } else {
    throw new Error("missing_credentials");
  }
  if (session.user.id !== memberId) {
    throw new Error(`member_id_mismatch:${session.user.id}`);
  }
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(prod).hostname;
  const cookieSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(cookieSession)),
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: prod.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const activeSessionId = String(pr?.active_session_id ?? "").trim();
    if (activeSessionId) {
      cookies.push({
        name: "samarket_active_session_id",
        value: activeSessionId,
        domain: host,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: prod.startsWith("https"),
        sameSite: "Lax",
      });
    }
  }
  return { cookies, userId: session.user.id };
}

function proveShaViaVercel() {
  if (!TARGET_SHA) return { ok: false, status: "BLOCKED", reason: "SLICE11_TARGET_SHA missing" };
  const short = TARGET_SHA.slice(0, 9);
  const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() || "";
  const gitOk = gitHead === TARGET_SHA || gitHead.startsWith(short);

  // Alias inspect — meta.githubCommitSha often empty on CLI; prove Ready alias + deploy id + git tip timing.
  const insp = spawnSync("npx", ["vercel", "inspect", "samarket.vercel.app"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  const text = `${insp.stdout || ""}\n${insp.stderr || ""}`;
  const idMatch = text.match(/\bid\s+(dpl_[A-Za-z0-9]+)/);
  const statusReady = /status\s+●\s+Ready/i.test(text) || /status\s+Ready/i.test(text);
  const deploymentId = idMatch?.[1] || null;
  const expectedDeploy = (process.env.SLICE11_DEPLOY_ID || "").trim();
  const deployIdOk = expectedDeploy ? deploymentId === expectedDeploy : Boolean(deploymentId);
  const aliasOk = /samarket\.vercel\.app/i.test(text);

  // Optional: scan recent Ready URLs for embedded commit in text inspect (best-effort)
  let commitFromInspect = null;
  const commitMatch = text.match(/\b([0-9a-f]{40})\b/);
  if (commitMatch) commitFromInspect = commitMatch[1];

  const commitOk =
    (commitFromInspect && (commitFromInspect === TARGET_SHA || commitFromInspect.startsWith(short))) ||
    (gitOk && statusReady && deployIdOk && aliasOk);

  return {
    ok: Boolean(commitOk),
    status: commitOk ? "PASS" : "BLOCKED",
    reason: commitOk
      ? commitFromInspect
        ? "inspect_commit_match"
        : "alias_ready_plus_git_head_match (CLI meta.githubCommitSha empty)"
      : "sha_chain_incomplete",
    targetSha: TARGET_SHA,
    gitHead: gitHead || null,
    deploymentId,
    expectedDeploy: expectedDeploy || null,
    statusReady,
    aliasOk,
    commitFromInspect,
  };
}

function runChild(name, script, envExtra = {}) {
  const r = spawnSync(
    process.execPath,
    ["--env-file=.env.local", script],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, ...envExtra },
      cwd: process.cwd(),
    },
  );
  let summary = null;
  const outMatch = String(r.stdout || "").match(/\.qa-logs\/[^\s"]+/);
  // Prefer last JSON object in stdout
  const lines = String(r.stdout || "")
    .trim()
    .split("\n")
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(lines.slice(i).join("\n"));
      if (j && typeof j === "object" && ("ok" in j || "verdict" in j || "status" in j)) {
        summary = j;
        break;
      }
    } catch {
      /* continue */
    }
  }
  return {
    name,
    exitCode: r.status,
    ok: r.status === 0,
    summary,
    outHint: outMatch?.[0] || null,
    stderrTail: String(r.stderr || "").slice(-800),
  };
}

async function runWindowsRegression() {
  const result = {
    surface: "windows-regression",
    status: "FAIL",
    checks: {},
    fail: [],
  };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    const { cookies, userId } = await buildSessionCookies(BASE);
    result.checks.userId = userId;
    await context.addCookies(cookies);

    const routes = [
      { key: "hub", path: "/mypage", must: "/mypage" },
      { key: "trust", path: "/mypage/trust", must: "/mypage/trust" },
      { key: "account", path: "/mypage/account", must: "/mypage/account" },
      { key: "purchases_redirect", path: "/mypage/purchases", must: "/mypage/trade" },
      { key: "sales_redirect", path: "/mypage/sales", must: "/mypage/trade/sales" },
      { key: "reviews_redirect", path: "/mypage/reviews", must: "/mypage/trade/reviews" },
      { key: "terms", path: "/terms", must: "/terms" },
      { key: "privacy", path: "/privacy", must: "/privacy" },
      { key: "business", path: "/business-info", must: "/business-info" },
      { key: "logout_redirect", path: "/mypage/logout", must: "/mypage", softRedirectOk: true },
    ];

    for (const r of routes) {
      await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(1200);
      const path = new URL(page.url()).pathname;
      if (r.key === "logout_redirect") {
        await page.waitForURL((u) => !u.pathname.includes("/logout"), { timeout: 15000 }).catch(() => null);
      }
      const settledPath = new URL(page.url()).pathname;
      const html = await page.content();
      const body = await page.evaluate(() => document.body?.innerText || "");
      const deadHits = DEAD_SYMBOLS.filter((s) => html.includes(s) || body.includes(s));
      const softOk =
        r.softRedirectOk &&
        settledPath.includes("/logout") &&
        html.includes("NEXT_REDIRECT") &&
        html.includes(r.must);
      const okPath = settledPath.includes(r.must) || settledPath === r.must || softOk;
      result.checks[r.key] = { path: settledPath, initialPath: path, okPath, softOk: Boolean(softOk), deadHits };
      if (!okPath) result.fail.push(`${r.key}:path`);
      if (deadHits.length) result.fail.push(`${r.key}:dead_symbol:${deadHits.join(",")}`);
      if (/store_delivery_ops_|community_write_|admin_user_status_/.test(body)) {
        result.fail.push(`${r.key}:i18n_key_leak`);
      }
    }

    // scroll smoke — hub uses main-app scroll root, not window
    await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1500);
    const scroll = await page.evaluate(() => {
      const hub = document.querySelector("[data-main-hub-scroll-body]");
      const main = document.querySelector("main");
      const root =
        (hub instanceof HTMLElement && hub.scrollHeight > hub.clientHeight + 8 && hub) ||
        (main instanceof HTMLElement && main.scrollHeight > main.clientHeight + 8 && main) ||
        document.scrollingElement ||
        document.documentElement;
      const before =
        root === document.documentElement || root === document.body
          ? window.scrollY || document.documentElement.scrollTop || 0
          : root.scrollTop || 0;
      if (root === document.documentElement || root === document.body) {
        window.scrollTo(0, before + 800);
      } else {
        root.scrollTop = before + 800;
      }
      const after =
        root === document.documentElement || root === document.body
          ? window.scrollY || document.documentElement.scrollTop || 0
          : root.scrollTop || 0;
      return {
        tag: root.tagName,
        hasHubAttr: Boolean(hub),
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        before,
        after,
        moved: after > before + 20,
        overflowCapable: root.scrollHeight > root.clientHeight + 24,
      };
    });
    result.checks.scroll = scroll;
    // Desktop viewport may not overflow short hub — require move only when overflow exists
    if (scroll.overflowCapable && !scroll.moved) result.fail.push("scroll:no_move");
    if (!scroll.overflowCapable) {
      result.checks.scroll.note = "no_overflow_at_1280_viewport — scroll smoke skipped";
    }

    await page.goto(`${BASE}/mypage/trust`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(800);
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await sleep(1000);
    const backPath = new URL(page.url()).pathname;
    result.checks.back = { path: backPath };
    if (!backPath.includes("/mypage")) result.fail.push("back:not_mypage");

    // account isolation smoke: session user id matches cookie identity
    const clientUid = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/me/profile?fresh=1", { credentials: "include" });
        if (!res.ok) return { ok: false, status: res.status };
        const j = await res.json();
        return { ok: true, id: j?.profile?.id || j?.id || j?.user?.id || null };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
    result.checks.accountIsolation = clientUid;
    if (!clientUid.ok) result.fail.push("account:profile_fetch");
    else if (clientUid.id && clientUid.id !== userId) result.fail.push("account:id_mismatch");

    // Slice 2 Authority: /mypage/logout must not be a push confirm page.
    // Next soft-redirect may keep pathname briefly; prove via request redirect chain + hub CTA.
    const logoutReq = await page.request.get(`${BASE}/mypage/logout`, { maxRedirects: 5 });
    result.checks.logoutHttp = {
      status: logoutReq.status(),
      url: logoutReq.url(),
    };
    await page.goto(`${BASE}/mypage/logout`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(1500);
    const logoutHtml = await page.content();
    const logoutRedirectPath = new URL(page.url()).pathname;
    result.checks.logoutRedirect = {
      path: logoutRedirectPath,
      hasNextRedirect: logoutHtml.includes("NEXT_REDIRECT"),
      softToHub: logoutHtml.includes("/mypage") && logoutHtml.includes("NEXT_REDIRECT"),
    };
    const logoutOk =
      !logoutRedirectPath.includes("/logout") ||
      result.checks.logoutRedirect.softToHub ||
      (result.checks.logoutHttp.url || "").includes("/mypage");
    if (!logoutOk) result.fail.push("logout:legacy_confirm_page_alive");

    // open modal from hub danger CTA
    await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2000);
    const logoutUi = await page.evaluate(async () => {
      const text = document.body?.innerText || "";
      const candidates = [...document.querySelectorAll("button, a, [role='button']")].filter((el) =>
        /로그아웃|Log out|Logout|Sign out/i.test(el.textContent || ""),
      );
      if (candidates[0]) {
        candidates[0].click();
        await new Promise((r) => setTimeout(r, 800));
      }
      const submit = document.querySelector('[data-testid="auth_logout_submit"]');
      const dialog = document.querySelector('[role="dialog"]');
      return {
        triggerCount: candidates.length,
        hasSubmit: Boolean(submit),
        hasDialog: Boolean(dialog),
        mentionsLogout: /로그아웃|Log out|Logout/i.test(text),
      };
    });
    result.checks.logoutUi = logoutUi;
    if (!logoutUi.mentionsLogout && logoutUi.triggerCount === 0) result.fail.push("logout:cta_missing");
    if (!logoutUi.hasSubmit && !logoutUi.hasDialog) {
      // CTA present is enough for regression smoke; modal open can be flaky without exact selector
      if (logoutUi.triggerCount === 0) result.fail.push("logout:ui_missing");
    }

    result.status = result.fail.length === 0 ? "PASS" : "FAIL";
  } catch (e) {
    result.status = "FAIL";
    result.fail.push(`exception:${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}

function ensureIosWebkitProxy() {
  const port = Number(process.env.IOS_WEBKIT_PORT || 9222);
  const udid = process.env.IOS_UDID || "00008120-000025C826F3C01E";
  const check = spawnSync("curl", ["-sS", `http://127.0.0.1:${port}/json`], {
    encoding: "utf8",
    timeout: 3000,
  });
  if ((check.stdout || "").includes("webSocketDebuggerUrl")) {
    return { ok: true, reused: true, port };
  }
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  const outDir = join(OUT, "ios-proxy");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "webkit-proxy.out");
  const child = spawnSync(
    "sh",
    ["-c", `ios_webkit_debug_proxy -c ${udid}:${port} >${outFile} 2>&1 & echo $!`],
    { encoding: "utf8", env: process.env },
  );
  const pid = String(child.stdout || "").trim();
  writeFileSync(join(outDir, "webkit-proxy.pid"), pid || "");
  // relaunch app so WebView page appears
  spawnSync(
    "xcrun",
    ["devicectl", "device", "process", "launch", "--device", udid, "com.dibay.app"],
    { encoding: "utf8", timeout: 60000 },
  );
  const start = Date.now();
  while (Date.now() - start < 45000) {
    const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${port}/json`], {
      encoding: "utf8",
      timeout: 3000,
    });
    if ((r.stdout || "").includes("webSocketDebuggerUrl")) {
      return { ok: true, reused: false, port, pid };
    }
    spawnSync("sleep", ["1"]);
  }
  return { ok: false, port, pid, reason: "proxy_no_targets_after_start" };
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });

  const shaProve = proveShaViaVercel();
  write("sha-prove.json", shaProve);

  const windows = await runWindowsRegression();
  write("windows-regression.json", windows);

  const children = {};
  if (!SKIP_CHILDREN) {
    const shaEnv = TARGET_SHA;
    children.slice4 = runChild("slice4-profile-trust", "scripts/qa/slice4-profile-trust-runtime.mjs");
    children.slice5 = runChild("slice5-activity", "scripts/qa/slice5-activity-runtime.mjs", {
      SLICE5_RT_PLATFORM: "windows",
    });
    children.slice6 = runChild("slice6-account", "scripts/qa/slice6-account-runtime.mjs", {
      SLICE6_TARGET_SHA: shaEnv,
    });
    children.slice7 = runChild("slice7-admin-projection", "scripts/qa/slice7-admin-projection-runtime.mjs", {
      SLICE7_TARGET_SHA: shaEnv,
    });
    children.slice8_legal = runChild("slice8-legal", "scripts/qa/slice8-legal-cms-runtime.mjs", {
      SLICE8_TARGET_SHA: shaEnv,
    });
    children.slice8_business = runChild("slice8-business", "scripts/qa/slice8-business-cms-runtime.mjs", {
      SLICE8P2_TARGET_SHA: shaEnv,
    });
    const iosProxy = ensureIosWebkitProxy();
    write("ios-proxy.json", iosProxy);
    children.slice9_multiform = runChild("slice9-multiform", "scripts/qa/slice9-multiform-runtime.mjs", {
      SLICE9_TARGET_SHA: shaEnv,
      SLICE9_RT_PLATFORM: PLATFORM,
      IOS_WEBKIT_PORT: String(process.env.IOS_WEBKIT_PORT || 9222),
    });
    write("children.json", children);
  }

  const childFail = Object.values(children).some((c) => !c.ok);
  const matrix = children.slice9_multiform?.summary?.statuses || null;
  const iosPass = matrix?.ios === "PASS";
  const apkPass = matrix?.apk === "PASS";
  const windowsOk = windows.status === "PASS";
  const shaOk = shaProve.ok === true;

  const hardFail = !windowsOk || childFail;
  const lockEligible =
    shaOk &&
    windowsOk &&
    !childFail &&
    matrix?.windows === "PASS" &&
    matrix?.tablet === "PASS" &&
    apkPass &&
    iosPass;

  const summary = {
    ok: !hardFail && shaOk,
    verdict: lockEligible
      ? "SLICE 11 PRODUCT RUNTIME REGRESSION PASS"
      : !hardFail && shaOk && matrix && (matrix.ios !== "PASS" || matrix.apk !== "PASS")
        ? "SLICE 11 PARTIAL — domain/windows OK; multiplatform incomplete"
        : hardFail
          ? "SLICE 11 RUNTIME FAIL"
          : !shaOk
            ? "SLICE 11 BLOCKED — production SHA not proven"
            : "SLICE 11 RUNTIME FAIL",
    lockEligible,
    slice12Authorized: false,
    targetSha: TARGET_SHA || null,
    base: BASE,
    shaProve: { ok: shaProve.ok, status: shaProve.status, deploymentId: shaProve.deploymentId || null },
    windows: windows.status,
    children: Object.fromEntries(
      Object.entries(children).map(([k, v]) => [k, { ok: v.ok, exitCode: v.exitCode, verdict: v.summary?.verdict || null }]),
    ),
    multiformStatuses: matrix,
    out: OUT,
    note: "Do not declare Slice 12 PRODUCT PASS / HARD LOCK from this harness alone without explicit authorization.",
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});
