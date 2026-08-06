/**
 * Slice 4 Profile/Trust — Production read-only Runtime.
 * Member /api/me/profile?fresh=1 ↔ Admin user detail ↔ DB trust_score parity.
 * Credentials ONLY via env. Do not commit secrets or print passwords.
 *
 *   node --env-file=.env.local scripts/qa/slice4-profile-trust-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
const MEMBER_LOGIN = process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55";
const MEMBER_ID = process.env.SLICE4_MEMBER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice4-trust-runtime-${TS}`);

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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nearlyEqual(a, b, eps = 0.001) {
  return Math.abs(Number(a) - Number(b)) <= eps;
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
    if (error || !data.session) {
      die("login_failed", { loginId, message: error?.message || "no session" });
    }
    session = data.session;
  } else if (sk) {
    // Password env missing: service-role magiclink → verifyOtp(token_hash) (no secret logged).
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: link, error: linkErr } = await adminSb.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const action = String(link?.properties?.action_link || "");
    let tokenHash = "";
    try {
      const u = new URL(action);
      tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    } catch {
      tokenHash = "";
    }
    if (linkErr || !tokenHash) {
      die("login_magiclink_failed", { loginId, message: linkErr?.message || "no token_hash" });
    }
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (otpErr || !verified.session) {
      die("login_otp_failed", { loginId, message: otpErr?.message || "no session" });
    }
    session = verified.session;
  } else {
    die("missing E2E_TEST_PASSWORD and SUPABASE_SERVICE_ROLE_KEY");
  }

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
  return { loginId, userId: session.user.id, cookie };
}

async function api(path, cookie, init = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const bust = `${path}${sep}_ts=${Date.now()}`;
  const res = await fetch(`${BASE}${bust}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      "cache-control": "no-store",
      pragma: "no-store",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function html(path, cookie) {
  const res = await fetch(`${BASE}${path}?_ts=${Date.now()}`, {
    headers: { cookie, "cache-control": "no-store", accept: "text/html" },
    cache: "no-store",
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function dbTrust(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) die("missing service role for DB read");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("profiles")
    .select("id, trust_score")
    .eq("id", userId)
    .maybeSingle();
  if (error) die("db_trust_read_failed", { message: error.message });
  return data;
}

function memberTrustFromProfile(body) {
  const row = body?.profile ?? body ?? {};
  if (row.trust_score != null && Number.isFinite(Number(row.trust_score))) {
    return Number(row.trust_score);
  }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(JSON.stringify({ phase: "start", out: OUT, base: BASE }, null, 2));

  const admin = await login(ADMIN_LOGIN);
  const member = await login(MEMBER_LOGIN);
  if (member.userId !== MEMBER_ID) {
    die("member_id_mismatch", { expected: MEMBER_ID, got: member.userId });
  }

  const memberProfile = await api("/api/me/profile?fresh=1", member.cookie);
  write("member-profile.json", {
    status: memberProfile.status,
    trust_score: memberTrustFromProfile(memberProfile.body),
  });
  if (memberProfile.status !== 200) {
    die("member_profile_failed", { status: memberProfile.status });
  }
  const M = memberTrustFromProfile(memberProfile.body);
  if (M == null) die("member_trust_missing");

  const adminDetail = await api(`/api/admin/users/${MEMBER_ID}`, admin.cookie);
  write("admin-user.json", {
    status: adminDetail.status,
    trust_score: num(adminDetail.body?.user?.trust_score),
  });
  if (adminDetail.status !== 200) {
    die("admin_user_failed", { status: adminDetail.status });
  }
  const A = num(adminDetail.body?.user?.trust_score);
  if (A == null) die("admin_trust_missing");

  const db = await dbTrust(MEMBER_ID);
  const D = num(db?.trust_score);
  write("db-trust.json", { trust_score: D });
  if (D == null) die("db_trust_missing");

  const trustPage = await html("/mypage/trust", member.cookie);
  const htmlOk =
    trustPage.status === 200 &&
    (trustPage.text.includes("mypage-trust") ||
      trustPage.text.includes("trust") ||
      trustPage.text.includes("/mypage/trust"));
  // Client page is RSC shell — markers may be in JS chunks; gate on HTTP 200 + logged-in route.
  write("trust-page-http.json", {
    status: trustPage.status,
    bytes: trustPage.text.length,
    htmlOk,
  });
  if (trustPage.status !== 200) die("trust_page_http_failed", { status: trustPage.status });

  const home = await html("/mypage", member.cookie);
  write("mypage-home-http.json", { status: home.status, bytes: home.text.length });
  if (home.status !== 200) die("mypage_home_http_failed", { status: home.status });

  const pass =
    nearlyEqual(M, A) && nearlyEqual(M, D) && nearlyEqual(A, D) && trustPage.status === 200;

  const summary = {
    ok: pass,
    verdict: pass ? "SLICE 4 RUNTIME PASS" : "SLICE 4 RUNTIME FAIL",
    base: BASE,
    memberLogin: MEMBER_LOGIN,
    adminLogin: ADMIN_LOGIN,
    memberTrust: M,
    adminTrust: A,
    dbTrust: D,
    memberAdminParity: nearlyEqual(M, A),
    memberDbParity: nearlyEqual(M, D),
    adminDbParity: nearlyEqual(A, D),
    trustPageStatus: trustPage.status,
    mypageHomeStatus: home.status,
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => die("uncaught", { message: String(e?.message || e) }));
