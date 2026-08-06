/**
 * Slice 8 Phase 1 Legal CMS — Production Runtime.
 * Public /api/legal/{terms|privacy} · Admin list · consent regression · authz.
 *
 *   SLICE8_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice8-legal-cms-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = (process.env.SLICE8_TARGET_SHA || "").trim();
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
const MEMBER_LOGIN = process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice8-runtime-${TS}`);

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
  return { cookie, userId: session.user.id };
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
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Guest public read
  const termsKo = await api("/api/legal/terms?locale=ko");
  const privacyEn = await api("/api/legal/privacy?locale=en");
  write("guest-terms-ko.json", termsKo);
  write("guest-privacy-en.json", privacyEn);
  if (termsKo.status !== 200 || !termsKo.json?.ok || !termsKo.json?.document?.version) {
    die("guest_terms_failed", termsKo);
  }
  if (privacyEn.status !== 200 || !privacyEn.json?.ok || !privacyEn.json?.document?.version) {
    die("guest_privacy_failed", privacyEn);
  }
  if (!termsKo.json.document.effective_at && !termsKo.json.document.published_at) {
    die("terms_missing_effective_or_published", termsKo);
  }

  const admin = await login(ADMIN_LOGIN);
  const member = await login(MEMBER_LOGIN);

  const adminList = await api("/api/admin/app-legal-documents", admin.cookie);
  write("admin-list.json", adminList);
  if (adminList.status !== 200 || !adminList.json?.ok) die("admin_list_failed", adminList);
  if (adminList.json.table_missing) die("table_missing_on_prod", adminList);

  const memberBlocked = await api("/api/admin/app-legal-documents", member.cookie);
  write("member-blocked.json", memberBlocked);
  if (memberBlocked.status < 400) die("member_should_be_blocked", memberBlocked);

  const anonBlocked = await api("/api/admin/app-legal-documents", "");
  write("anon-blocked.json", anonBlocked);
  if (anonBlocked.status < 400) die("anon_should_be_blocked", anonBlocked);

  // Consent writer regression
  const consent = await api("/api/me/legal-consent", member.cookie);
  write("member-consent.json", consent);
  if (consent.status !== 200 || !consent.json?.ok) die("consent_get_failed", consent);
  const c = consent.json.consent || consent.json;
  if (!c?.requiredTermsVersion || !c?.requiredPrivacyVersion) {
    die("consent_versions_missing", consent);
  }

  const htmlTerms = await fetch(`${BASE}/terms?_ts=${Date.now()}`, { cache: "no-store" });
  const htmlPrivacy = await fetch(`${BASE}/privacy?_ts=${Date.now()}`, { cache: "no-store" });
  write("html-status.json", { terms: htmlTerms.status, privacy: htmlPrivacy.status });
  if (htmlTerms.status !== 200 || htmlPrivacy.status !== 200) {
    die("html_pages_failed", { terms: htmlTerms.status, privacy: htmlPrivacy.status });
  }

  const summary = {
    ok: true,
    verdict: "SLICE 8 LEGAL CMS PHASE 1 RUNTIME PASS",
    targetSha: TARGET_SHA || null,
    base: BASE,
    termsVersion: termsKo.json.document.version,
    privacyVersion: privacyEn.json.document.version,
    adminDocs: Array.isArray(adminList.json.documents) ? adminList.json.documents.length : 0,
    authz: { member: memberBlocked.status, anon: anonBlocked.status },
    consentRequired: {
      terms: c.requiredTermsVersion,
      privacy: c.requiredPrivacyVersion,
    },
    out: OUT,
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => die("uncaught", { message: String(e?.message || e) }));
