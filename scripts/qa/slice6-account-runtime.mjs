/**
 * Slice 6 Account — Production Runtime (HTTP redirects + account surfaces).
 *   node --env-file=.env.local scripts/qa/slice6-account-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = process.env.SLICE6_TARGET_SHA || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const MEMBER_LOGIN = process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55";
const MEMBER_ID = process.env.SLICE6_MEMBER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice6-runtime-${TS}`);

function die(msg, extra) {
  const payload = { ok: false, error: msg, ...(extra || {}) };
  console.error(JSON.stringify(payload, null, 2));
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(payload, null, 2));
  } catch {
    /* ignore */
  }
  process.exit(1);
}

function write(name, obj) {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, 2));
}

async function login(loginId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) die("missing supabase anon env");
  const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  if (PASSWORD) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) die("login_failed", { message: error?.message });
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
    if (linkErr || !tokenHash) die("login_magiclink_failed", { message: linkErr?.message });
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (otpErr || !verified.session) die("login_otp_failed", { message: otpErr?.message });
    session = verified.session;
  } else die("missing credentials");
  if (session.user.id !== MEMBER_ID) die("member_id_mismatch", { got: session.user.id });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  const cookieSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  let cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(cookieSession))}`;
  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { cookie };
}

async function follow(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie, accept: "text/html" },
    redirect: "manual",
    cache: "no-store",
  });
  return { status: res.status, location: res.headers.get("location") || "" };
}

async function getOk(path, cookie) {
  const res = await fetch(`${BASE}${path}?_ts=${Date.now()}`, {
    headers: { cookie, accept: "text/html" },
    redirect: "follow",
    cache: "no-store",
  });
  return { status: res.status, finalUrl: res.url };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { cookie } = await login(MEMBER_LOGIN);
  const redirects = {
    settingsAddress: await follow("/mypage/section/settings/address", cookie),
    storeAddress: await follow("/mypage/section/store/address", cookie),
    accountInfo: await follow("/mypage/section/account/account-info", cookie),
    deleteRequest: await follow("/account/delete-request", cookie),
  };
  const pages = {};
  for (const p of [
    "/mypage",
    "/mypage/account",
    "/mypage/addresses",
    "/mypage/section/settings/device-permissions",
    "/mypage/section/settings/notifications",
    "/mypage/section/settings/country",
    "/mypage/section/settings/leave",
    "/mypage/section/store/payment",
  ]) {
    pages[p] = await getOk(p, cookie);
  }

  let windows = { ok: false, skip: true };
  try {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = new URL(BASE).hostname;
    for (const part of cookie.split(";").map((s) => s.trim()).filter(Boolean)) {
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      await context.addCookies([
        { name: part.slice(0, eq), value: decodeURIComponent(part.slice(eq + 1)), domain: host, path: "/" },
      ]);
    }
    const page = await context.newPage();
    await page.goto(`${BASE}/mypage/section/settings/address`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const afterAddress = page.url();
    await page.goto(`${BASE}/mypage/account`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const account = page.url();
    await browser.close();
    windows = {
      ok: afterAddress.includes("/mypage/addresses") && account.includes("/mypage/account"),
      afterAddress,
      account,
    };
  } catch (e) {
    windows = { ok: false, error: String(e?.message || e) };
  }

  const redirectOk =
    redirects.settingsAddress.location.includes("/mypage/addresses") &&
    redirects.storeAddress.location.includes("/mypage/addresses") &&
    redirects.accountInfo.location.includes("/mypage/account") &&
    redirects.deleteRequest.location.includes("/mypage/section/settings/leave") &&
    [redirects.settingsAddress, redirects.storeAddress, redirects.accountInfo, redirects.deleteRequest].every(
      (r) => r.status === 307 || r.status === 308 || r.status === 302,
    );
  const pagesOk = Object.values(pages).every((p) => p.status === 200);
  const pass = redirectOk && pagesOk && windows.ok !== false;
  const summary = {
    ok: pass,
    verdict: pass ? "SLICE 6 RUNTIME PASS" : "SLICE 6 RUNTIME FAIL",
    targetSha: TARGET_SHA || null,
    base: BASE,
    redirects,
    pages,
    windows,
    out: OUT,
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => die("uncaught", { message: String(e?.message || e) }));
