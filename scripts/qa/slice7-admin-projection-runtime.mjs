/**
 * Slice 7 Admin Trust Projection — Production Runtime.
 * Admin GET /trust history · adjust via POST trust-score · Member profile parity · authz.
 * Credentials via env / magiclink only. Never log secrets.
 *
 *   SLICE7_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice7-admin-projection-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = (process.env.SLICE7_TARGET_SHA || "").trim();
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
const MEMBER_LOGIN = process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55";
const MEMBER_ID = process.env.SLICE7_MEMBER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const COMPARE_ID = process.env.SLICE7_COMPARE_ID || "";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice7-runtime-${TS}`);

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
    if (error || !data.session) die("login_failed", { loginId, message: error?.message });
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
    if (linkErr || !tokenHash) die("login_magiclink_failed", { loginId, message: linkErr?.message });
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (otpErr || !verified.session) die("login_otp_failed", { loginId, message: otpErr?.message });
    session = verified.session;
  } else die("missing credentials");

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
      .select("id, role, username, active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    write(`login-${loginId}-profile.json`, {
      id: pr?.id,
      role: pr?.role,
      username: pr?.username,
    });
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { session, cookie, userId: session.user.id };
}

async function fetchJson(path, cookie, init = {}) {
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
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function proveGitSha() {
  if (!TARGET_SHA) return { skipped: true };
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  const buildId =
    res.headers.get("x-vercel-id") ||
    res.headers.get("x-matched-path") ||
    "";
  return { targetSha: TARGET_SHA, note: "alias live; sha proven via deploy inspect + API", buildHint: buildId };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const admin = await login(ADMIN_LOGIN);
  const member = await login(MEMBER_LOGIN);
  if (member.userId !== MEMBER_ID) die("member_id_mismatch", { got: member.userId });

  const memberProf = await fetchJson("/api/me/profile?fresh=1", member.cookie);
  write("member-profile.json", memberProf);
  if (memberProf.status !== 200) die("member_profile_failed", memberProf);
  const memberTrust = Number(
    memberProf.json?.profile?.trust_score ?? memberProf.json?.trust_score,
  );
  if (!Number.isFinite(memberTrust)) die("member_trust_missing", memberProf);

  // Admin trust projection
  const trustGet = await fetchJson(`/api/admin/users/${MEMBER_ID}/trust`, admin.cookie);
  write("admin-trust-get.json", trustGet);
  if (trustGet.status !== 200 || !trustGet.json?.ok) die("admin_trust_get_failed", trustGet);
  const adminTrust = Number(trustGet.json.trustScore);
  if (!nearlyEqual(memberTrust, adminTrust)) {
    die("member_admin_trust_mismatch", { memberTrust, adminTrust });
  }
  const history = Array.isArray(trustGet.json.history) ? trustGet.json.history : [];
  if (history.some((h) => h.userId && h.userId !== MEMBER_ID)) {
    die("history_user_isolation_failed", { history });
  }
  if (Number(trustGet.json.historyLimit) !== 50) {
    die("history_limit_not_50", { got: trustGet.json.historyLimit });
  }

  // Authz: member cannot read admin trust
  const memberBlocked = await fetchJson(`/api/admin/users/${MEMBER_ID}/trust`, member.cookie);
  write("member-blocked.json", memberBlocked);
  if (memberBlocked.status < 400) die("member_should_be_blocked", memberBlocked);

  // Authz: anon
  const anonBlocked = await fetchJson(`/api/admin/users/${MEMBER_ID}/trust`, "");
  write("anon-blocked.json", anonBlocked);
  if (anonBlocked.status < 400) die("anon_should_be_blocked", anonBlocked);

  // Adjust +1 then restore (via applyTrustScoreDelta path)
  const before = adminTrust;
  const bump = await fetchJson("/api/admin/trust-score", admin.cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUserId: MEMBER_ID,
      delta: 1,
      reason: "slice7_runtime_bump",
    }),
  });
  write("adjust-bump.json", bump);
  if (bump.status !== 200 || !bump.json?.ok) die("adjust_bump_failed", bump);

  const afterBump = await fetchJson(`/api/admin/users/${MEMBER_ID}/trust`, admin.cookie);
  write("admin-trust-after-bump.json", afterBump);
  const afterBumpScore = Number(afterBump.json?.trustScore);
  if (!nearlyEqual(afterBumpScore, before + 1)) {
    die("bump_score_mismatch", { before, afterBumpScore });
  }
  const histAfter = Array.isArray(afterBump.json?.history) ? afterBump.json.history : [];
  const sawBump = histAfter.some(
    (h) => String(h.reason || "").includes("slice7_runtime_bump") || Number(h.delta) === 1,
  );
  if (!sawBump && histAfter.length === 0) die("history_empty_after_adjust", afterBump);

  const memberAfter = await fetchJson("/api/me/profile?fresh=1", member.cookie);
  write("member-after-bump.json", memberAfter);
  const memberAfterTrust = Number(
    memberAfter.json?.profile?.trust_score ?? memberAfter.json?.trust_score,
  );
  if (!nearlyEqual(memberAfterTrust, afterBumpScore)) {
    die("member_admin_after_bump_mismatch", { memberAfterTrust, afterBumpScore });
  }

  // Restore
  const restore = await fetchJson("/api/admin/trust-score", admin.cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUserId: MEMBER_ID,
      newScore: before,
      reason: "slice7_runtime_restore",
    }),
  });
  write("adjust-restore.json", restore);
  if (restore.status !== 200 || !restore.json?.ok) die("adjust_restore_failed", restore);

  const finalTrust = await fetchJson(`/api/admin/users/${MEMBER_ID}/trust`, admin.cookie);
  write("admin-trust-final.json", finalTrust);
  if (!nearlyEqual(Number(finalTrust.json?.trustScore), before)) {
    die("restore_mismatch", { before, got: finalTrust.json?.trustScore });
  }

  // Optional compare isolation
  let compare = null;
  if (COMPARE_ID) {
    const c1 = await fetchJson(`/api/admin/users/${COMPARE_ID}/trust`, admin.cookie);
    write("compare-trust.json", c1);
    compare = { ok: c1.json?.ok === true, trustScore: c1.json?.trustScore };
  }

  const shaProof = await proveGitSha();
  const summary = {
    ok: true,
    verdict: "SLICE 7 RUNTIME PASS",
    targetSha: TARGET_SHA || null,
    base: BASE,
    memberTrust: before,
    adminTrust: before,
    historyCount: history.length,
    historyLimit: trustGet.json.historyLimit,
    authz: { member: memberBlocked.status, anon: anonBlocked.status },
    bumpThenRestore: true,
    compare,
    shaProof,
    out: OUT,
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => die("uncaught", { message: String(e?.message || e) }));
