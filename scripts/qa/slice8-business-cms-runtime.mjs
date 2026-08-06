/**
 * Slice 8 Phase 2 Business CMS — Production Runtime.
 *   SLICE8P2_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice8-business-cms-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = (process.env.SLICE8P2_TARGET_SHA || "").trim();
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
const MEMBER_LOGIN = process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice8p2-runtime-${TS}`);

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

  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  let cookie = `${cookieName}=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }),
  )}`;
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

async function api(path, cookie = "", init = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}_ts=${Date.now()}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      "cache-control": "no-store",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const guest = await api("/api/business-info?locale=ko");
  write("guest-business.json", guest);
  if (guest.status !== 200 || !guest.json?.ok || !guest.json?.document?.companyName) {
    die("guest_business_failed", guest);
  }

  // Legal still works (isolation)
  const legal = await api("/api/legal/terms?locale=ko");
  write("legal-still.json", { status: legal.status, ok: legal.json?.ok });
  if (legal.status !== 200 || !legal.json?.ok) die("legal_regression", legal);

  const admin = await login(ADMIN_LOGIN);
  const member = await login(MEMBER_LOGIN);

  const adminList = await api("/api/admin/app-business-info", admin.cookie);
  write("admin-list.json", adminList);
  if (adminList.status !== 200 || !adminList.json?.ok) die("admin_list_failed", adminList);
  if (adminList.json.table_missing) die("table_missing", adminList);

  const memberBlocked = await api("/api/admin/app-business-info", member.cookie);
  write("member-blocked.json", memberBlocked);
  if (memberBlocked.status < 400) die("member_should_be_blocked", memberBlocked);

  const html = await fetch(`${BASE}/business-info?_ts=${Date.now()}`, { cache: "no-store" });
  write("html.json", { status: html.status });
  if (html.status !== 200) die("html_failed", { status: html.status });

  const summary = {
    ok: true,
    verdict: "SLICE 8 BUSINESS CMS PHASE 2 RUNTIME PASS",
    targetSha: TARGET_SHA || null,
    base: BASE,
    companyName: guest.json.document.companyName,
    adminDocs: Array.isArray(adminList.json.documents) ? adminList.json.documents.length : 0,
    authz: { member: memberBlocked.status },
    legalIsolation: true,
    out: OUT,
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => die("uncaught", { message: String(e?.message || e) }));
