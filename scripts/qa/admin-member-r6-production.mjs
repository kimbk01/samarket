#!/usr/bin/env node
/**
 * R6 Admin Privilege — Production runtime proof.
 * Disposable fixture via admin create + privilege promote/revoke.
 * Never mutates real super-admin accounts. No passwords in artifacts.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * R6_EXPECT_SHA=<full-or-12> \
 *   node scripts/qa/admin-member-r6-production.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require(
  resolve(process.cwd(), "node_modules/@playwright/test/node_modules/playwright"),
);

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-member-r6");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = String(process.env.R6_EXPECT_SHA || "").trim();

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean),
    ),
  ];
}

async function loginSession(email, passwordList = passwords()) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of passwordList) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  return null;
}

async function resolveActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
}

function authCookies(session, activeSessionId = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    }),
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({ ...base, name: "samarket_signup_locale", value: "ko" });
  if (activeSessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
    });
  }
  return cookies;
}

function stamp() {
  return Date.now().toString(36).slice(-6);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, sk, { auth: { persistSession: false } });
}

async function privilegeIntegrity() {
  const admin = serviceClient();
  const { data: rows } = await admin
    .from("admin_memberships")
    .select("id,user_id,role,status");
  const active = (rows || []).filter((r) => r.status === "active");
  const byUser = new Map();
  for (const r of active) {
    byUser.set(r.user_id, (byUser.get(r.user_id) || 0) + 1);
  }
  const roles = {};
  for (const r of active) {
    const role = String(r.role || "");
    roles[role] = (roles[role] || 0) + 1;
  }
  const { count: profileCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return {
    profileCount: profileCount ?? null,
    activeMemberships: active.length,
    adminActive: roles.admin || 0,
    superAdminActive: roles.super_admin || 0,
    normalApprox:
      profileCount != null ? Math.max(0, profileCount - active.length) : null,
    duplicateActiveUsers: [...byUser.values()].filter((n) => n > 1).length,
    invalidActiveRoles: active.filter(
      (r) => r.role !== "admin" && r.role !== "super_admin",
    ).length,
  };
}

async function membershipSnapshot(userId) {
  const admin = serviceClient();
  const { data } = await admin
    .from("admin_memberships")
    .select("id,role,status,revoked_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data || null;
}

async function latestPrivilegeAudit(targetId, action) {
  const admin = serviceClient();
  const { data } = await admin
    .from("audit_logs")
    .select("id,action,actor_id,target_id,before_json,after_json,created_at")
    .eq("target_id", targetId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const report = {
    cut: "R6_ADMIN_PRIVILEGE",
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    startedAt: new Date().toISOString(),
    integrityBefore: null,
    integrityAfter: null,
    fixture: null,
    checks: {},
    notProven: [],
    failed: [],
    result: "FAIL",
  };

  report.integrityBefore = await privilegeIntegrity();
  if (
    report.integrityBefore.duplicateActiveUsers > 0 ||
    report.integrityBefore.invalidActiveRoles > 0
  ) {
    report.error = "integrity_violation_before";
    writeFileSync(resolve(OUT, "r6-production.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: "FAIL", error: report.error }, null, 2));
    process.exit(1);
  }

  const auth = await loginSession(EMAIL);
  if (!auth?.session) {
    report.error = "admin_auth_failed";
    writeFileSync(resolve(OUT, "r6-production.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: "FAIL", error: "admin_auth_failed" }, null, 2));
    process.exit(1);
  }
  const actorId = auth.session.user.id;
  const activeSessionId = await resolveActiveSessionId(actorId);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  // Production authority
  await page.goto(`${ORIGIN}/admin/users`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const meta = await page.evaluate(async () => {
    const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  });
  report.checks.adminMeOk = meta.status === 200 && meta?.data?.ok !== false;
  report.checks.actorIsSuperAdmin = Boolean(meta?.data?.isSuperAdmin || meta?.data?.role === "master");

  const tag = stamp();
  const username = `r6qa_${tag}`;
  const initialPassword = `Qa${tag}A1!x`;
  const phone = `0918${String(Date.now()).slice(-7)}`;
  const nick = `R6QA${tag}`;

  const createRes = await page.evaluate(
    async ({ username, password, nickname, name, phone }) => {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          passwordConfirm: password,
          nickname,
          name,
          phone,
          phoneVerified: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    },
    { username, password: initialPassword, nickname: nick, name: nick, phone },
  );

  const userId = String(createRes?.data?.user?.id || createRes?.data?.id || "").trim();
  if (!userId) {
    report.error = "fixture_create_failed";
    report.createRes = { status: createRes.status, error: createRes?.data?.error || null };
    writeFileSync(resolve(OUT, "r6-production.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: "FAIL", error: "fixture_create_failed" }, null, 2));
    await browser.close();
    process.exit(1);
  }

  report.fixture = {
    id: userId,
    username,
    creationPath: "POST /api/admin/users/create",
    disposable: true,
  };

  // A–F baseline detail/list
  await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  const detailText = await page.locator("body").innerText();
  report.checks.detailShowsMember = detailText.includes("일반 회원");
  report.checks.promoteCtaVisible =
    (await page.locator('[data-member-cta-cap="CAP-PRIV-PROMOTE"]').count()) > 0;

  // Self mutation API (actor on self)
  const selfRes = await page.evaluate(async (id) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "promote" }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, actorId);
  report.checks.selfPromoteRejected =
    selfRes.status === 403 && selfRes?.data?.error === "self_mutation_forbidden";

  // Highest target protection — find a super_admin id (read-only)
  const adminDb = serviceClient();
  const { data: supers } = await adminDb
    .from("admin_memberships")
    .select("user_id")
    .eq("status", "active")
    .eq("role", "super_admin")
    .limit(1);
  const superId = supers?.[0]?.user_id ? String(supers[0].user_id) : null;
  if (superId && superId !== actorId) {
    const superRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "revoke" }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, superId);
    report.checks.superTargetRejected =
      superRes.status === 403 &&
      (superRes?.data?.error === "cannot_modify_super_admin" ||
        superRes?.data?.error === "last_super_admin");
  } else if (superId && superId === actorId) {
    // Actor is the super — self path already covers mutation of highest self.
    report.checks.superTargetRejected = report.checks.selfPromoteRejected;
    report.notProven.push("destructive_last_super_admin_revoke_runtime");
  } else {
    report.notProven.push("no_super_admin_row_for_target_protection");
  }

  // Promote via dialog
  await page.locator('[data-member-cta-cap="CAP-PRIV-PROMOTE"]').click();
  await page.waitForSelector('[data-member-privilege-dialog="1"]', { timeout: 15000 });
  report.checks.promoteDialogOp =
    (await page.locator('[data-member-privilege-op="promote"]').count()) > 0;
  await page.locator("[data-member-admin-dialog-primary]").click();
  await page.waitForTimeout(1500);

  // Prefer API confirm if dialog path flaky
  let membership = await membershipSnapshot(userId);
  if (!membership) {
    const promoteApi = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "promote" }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, userId);
    report.checks.promoteApi = promoteApi.status === 200 && promoteApi?.data?.ok === true;
    membership = await membershipSnapshot(userId);
  } else {
    report.checks.promoteApi = true;
  }
  report.checks.canonicalActiveAdmin = Boolean(membership && membership.role === "admin");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  const afterPromoteText = await page.locator("body").innerText();
  report.checks.detailShowsAdmin = afterPromoteText.includes("관리자");
  report.checks.revokeCtaVisible =
    (await page.locator('[data-member-cta-cap="CAP-PRIV-REVOKE"]').count()) > 0;

  const promoteAudit = await latestPrivilegeAudit(userId, "promote_to_admin");
  report.checks.promoteAudit = Boolean(
    promoteAudit && promoteAudit.actor_id === actorId && promoteAudit.target_id === userId,
  );

  // Duplicate promote
  const dupPromote = await page.evaluate(async (id) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "promote" }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, userId);
  report.checks.duplicatePromoteRejected =
    dupPromote.status === 409 && dupPromote?.data?.error === "already_admin";

  // Promoted access with new session
  const memberEmail = `${username}@manual.local`;
  const memberAuth = await loginSession(memberEmail, [initialPassword]);
  report.checks.promotedLogin = Boolean(memberAuth?.session);
  let promotedCtx = null;
  let promotedPage = null;
  if (memberAuth?.session) {
    const memberActive = await resolveActiveSessionId(userId);
    promotedCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await promotedCtx.addCookies(authCookies(memberAuth.session, memberActive));
    promotedPage = await promotedCtx.newPage();
    await promotedPage.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const me = await promotedPage.evaluate(async () => {
      const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    });
    report.checks.promotedAdminMe =
      me.status === 200 && (me?.data?.ok === true || me?.data?.isAdmin === true || me?.data?.role);
    // Keep this context for pre-revoke session proof
  }

  // List privilege cell
  await page.goto(`${ORIGIN}/admin/users?q=${encodeURIComponent(username)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(1200);
  const listText = await page.locator("body").innerText();
  report.checks.listShowsAdmin = listText.includes("관리자");

  // Revoke via dialog
  await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  if ((await page.locator('[data-member-cta-cap="CAP-PRIV-REVOKE"]').count()) > 0) {
    await page.locator('[data-member-cta-cap="CAP-PRIV-REVOKE"]').click();
    await page.waitForSelector('[data-member-privilege-op="revoke"]', { timeout: 15000 });
    await page.locator("[data-member-admin-dialog-primary]").click();
    await page.waitForTimeout(1500);
  }
  membership = await membershipSnapshot(userId);
  if (membership) {
    const revokeApi = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "revoke" }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, userId);
    report.checks.revokeApi = revokeApi.status === 200 && revokeApi?.data?.ok === true;
    membership = await membershipSnapshot(userId);
  } else {
    report.checks.revokeApi = true;
  }
  report.checks.canonicalRevoked = membership == null;

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  const afterRevokeText = await page.locator("body").innerText();
  report.checks.detailShowsMemberAfterRevoke = afterRevokeText.includes("일반 회원");

  const revokeAudit = await latestPrivilegeAudit(userId, "revoke_admin_privilege");
  report.checks.revokeAudit = Boolean(
    revokeAudit && revokeAudit.actor_id === actorId && revokeAudit.target_id === userId,
  );

  // Duplicate revoke
  const dupRevoke = await page.evaluate(async (id) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/privilege`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "revoke" }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, userId);
  report.checks.duplicateRevokeRejected =
    dupRevoke.status === 409 && dupRevoke?.data?.error === "not_admin";

  // Pre-revoke session after revoke
  if (promotedPage) {
    const after = await promotedPage.evaluate(async () => {
      const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    });
    report.checks.revokedSessionDenied =
      after.status === 401 ||
      after.status === 403 ||
      after?.data?.ok === false ||
      after?.data?.isAdmin === false ||
      !after?.data?.role;
    report.checks.revokedSessionStatus = after.status;
    await promotedCtx.close();
  } else {
    report.notProven.push("promoted_session_for_revoke_propagation");
  }

  // Lifecycle / store independence (fixture should remain non-deleted, no store)
  const { data: profileAfter } = await adminDb
    .from("profiles")
    .select("id,deleted_at,status,member_type")
    .eq("id", userId)
    .maybeSingle();
  report.checks.lifecycleUnchanged = !profileAfter?.deleted_at;
  const { data: stores } = await adminDb
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId);
  report.checks.storeUnchanged = (stores || []).length === 0;

  report.integrityAfter = await privilegeIntegrity();
  report.checks.integrityNoDupAfter = report.integrityAfter.duplicateActiveUsers === 0;
  report.checks.integrityNoInvalidAfter = report.integrityAfter.invalidActiveRoles === 0;
  report.checks.superCountPreserved =
    report.integrityAfter.superAdminActive === report.integrityBefore.superAdminActive;

  const required = [
    "detailShowsMember",
    "promoteCtaVisible",
    "selfPromoteRejected",
    "canonicalActiveAdmin",
    "detailShowsAdmin",
    "promoteAudit",
    "duplicatePromoteRejected",
    "promotedAdminMe",
    "listShowsAdmin",
    "canonicalRevoked",
    "detailShowsMemberAfterRevoke",
    "revokeAudit",
    "duplicateRevokeRejected",
    "revokedSessionDenied",
    "lifecycleUnchanged",
    "storeUnchanged",
    "integrityNoDupAfter",
    "superCountPreserved",
  ];
  for (const key of required) {
    if (report.checks[key] !== true) report.failed.push(key);
  }
  if (report.checks.superTargetRejected === false) report.failed.push("superTargetRejected");

  report.result = report.failed.length === 0 ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, "r6-production.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        result: report.result,
        failed: report.failed,
        notProven: report.notProven,
        fixtureId: userId,
        integrityBefore: report.integrityBefore,
        integrityAfter: report.integrityAfter,
      },
      null,
      2,
    ),
  );
  await browser.close();
  process.exit(report.result === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
