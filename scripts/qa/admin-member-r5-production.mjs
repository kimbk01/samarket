#!/usr/bin/env node
/**
 * R5 Store Relationship — Production runtime proof.
 * Disposable fixture via admin create + member apply. No plaintext passwords in artifacts.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * R5_EXPECT_SHA=<full-or-12> \
 *   node scripts/qa/admin-member-r5-production.mjs
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
const OUT = resolve(process.cwd(), "docs/perf/admin-member-r5");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = String(process.env.R5_EXPECT_SHA || "").trim();

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

async function integrityCounts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: stores } = await admin.from("stores").select("id,owner_user_id,approval_status");
  const by = new Map();
  let nullOwner = 0;
  for (const s of stores || []) {
    if (!s.owner_user_id) {
      nullOwner += 1;
      continue;
    }
    by.set(s.owner_user_id, (by.get(s.owner_user_id) || 0) + 1);
  }
  const multi = [...by.values()].filter((n) => n > 1).length;
  return {
    storeRows: (stores || []).length,
    distinctOwners: by.size,
    nullOwner,
    multiOwners: multi,
  };
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const report = {
    cut: "R5_STORE_RELATIONSHIP",
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    startedAt: new Date().toISOString(),
    integrityBefore: null,
    integrityAfter: null,
    fixture: null,
    checks: {},
    failed: [],
    result: "FAIL",
  };

  report.integrityBefore = await integrityCounts();

  const auth = await loginSession(EMAIL);
  if (!auth?.session) {
    report.error = "admin_auth_failed";
    writeFileSync(resolve(OUT, "r5-production.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: "FAIL", error: "admin_auth_failed" }, null, 2));
    process.exit(1);
  }
  const actorId = auth.session.user.id;
  const activeSessionId = await resolveActiveSessionId(actorId);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  const tag = stamp();
  const username = `r5qa_${tag}`;
  const initialPassword = `Qa${tag}A1!x`;
  const phone = `0917${String(Date.now()).slice(-7)}`;
  const nick = `R5QA${tag}`;
  const slug = `r5qa-${tag}`;

  await page.goto(`${ORIGIN}/admin/users`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1200);

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
    writeFileSync(resolve(OUT, "r5-production.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: "FAIL", error: "fixture_create_failed" }, null, 2));
    await browser.close();
    process.exit(1);
  }

  report.fixture = {
    id: userId,
    username,
    phone,
    creationPath: "POST /api/admin/users/create",
    disposable: true,
  };

  // A — no store detail
  await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  if ((await page.locator('[data-member-tab="store"]').count()) > 0) {
    await page.locator('[data-member-tab="store"]').click();
    await page.waitForTimeout(500);
  }
  report.checks.noStorePanel = (await page.locator('[data-member-detail-store="none"]').count()) > 0;
  await page.locator('[data-member-cta="store_rel"]').click();
  await page.waitForSelector('[data-member-store-relation-dialog="1"]', { timeout: 15000 });
  report.checks.s27None = (await page.locator('[data-member-store-relation="none"]').count()) > 0;
  report.checks.attachBlocked = (await page.locator('[data-member-store-rel-blocked="attach"]').count()) > 0;
  await page.locator('[data-member-admin-dialog-primary]').click();
  await page.waitForTimeout(400);

  // Member apply CREATE_RELATION
  const memberEmail = `${username}@manual.local`;
  const memberAuth = await loginSession(memberEmail, [initialPassword]);
  report.checks.memberLogin = Boolean(memberAuth?.session);
  let storeId = null;
  if (memberAuth?.session) {
    const memberCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const memberActive = await resolveActiveSessionId(userId);
    await memberCtx.addCookies(authCookies(memberAuth.session, memberActive));
    const mpage = await memberCtx.newPage();
    await mpage.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

    const addrRes = await mpage.evaluate(
      async ({ phone, nick }) => {
        const res = await fetch("/api/me/addresses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labelType: "home",
            nickname: nick,
            recipientName: nick,
            phoneNumber: phone,
            province: "Cebu",
            cityMunicipality: "Cebu City",
            streetAddress: "R5 QA Master Street",
            detailAddress: "Unit R5 QA",
            unitFloorRoom: "Unit R5 QA",
            formattedAddress: "R5 QA Master Street, Cebu City, Cebu, Philippines",
            fullAddress: "R5 QA Master Street, Cebu City, Cebu, Philippines",
            latitude: 10.3157,
            longitude: 123.8854,
            isDefaultMaster: true,
            useForDelivery: true,
            useForLife: true,
            useForTrade: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
      },
      { phone, nick },
    );
    report.checks.masterAddress = addrRes.status === 200 && addrRes?.data?.ok === true;
    report.checks.masterAddressError = addrRes?.data?.error || null;

    const applyBody = {
      shopName: `R5매장${tag}`,
      storeSlug: slug,
      applicantNickname: nick,
      phone,
      categoryPrimarySlug: "restaurant",
      categorySubSlug: "snack",
      categoryLabelLine: "식당 · 분식",
    };
    const applyRes = await mpage.evaluate(async (body) => {
      const res = await fetch("/api/me/stores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, applyBody);
    storeId = String(
      applyRes?.data?.store?.id || applyRes?.data?.id || applyRes?.data?.storeId || "",
    ).trim() || null;
    if (!storeId && applyRes?.data?.ok && applyRes?.data?.store) {
      storeId = String(applyRes.data.store.id || "").trim() || null;
    }
    report.checks.createRelation =
      (applyRes.status === 200 || applyRes.status === 201) && applyRes?.data?.ok !== false;
    report.checks.createStatus = applyRes.status;
    report.checks.createError = applyRes?.data?.error || null;

    const apply2 = await mpage.evaluate(async (body) => {
      const res = await fetch("/api/me/stores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          shopName: `${body.shopName}-2`,
          storeSlug: `${body.storeSlug}-2`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, applyBody);
    report.checks.secondStoreRejected =
      apply2.status === 409 || apply2?.data?.error === "already_has_active_application";
    report.checks.secondStoreError = apply2?.data?.error || null;
    await memberCtx.close();
  }

  // Fallback store id from DB
  if (!storeId) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data } = await admin.from("stores").select("id").eq("owner_user_id", userId).limit(1);
    storeId = data?.[0]?.id ? String(data[0].id) : null;
  }
  report.fixture.storeId = storeId;

  // Approve pending if created
  if (storeId) {
    const approveRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_store" }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }, storeId);
    report.checks.approvePending = approveRes.status === 200 && approveRes?.data?.ok !== false;
    report.checks.approveStatus = approveRes.status;
  }

  // B–H detail with store + navigation
  await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  if ((await page.locator('[data-member-tab="store"]').count()) > 0) {
    await page.locator('[data-member-tab="store"]').click();
    await page.waitForTimeout(600);
  }
  report.checks.hasStorePanel = (await page.locator('[data-member-detail-store="one"]').count()) > 0;
  report.checks.stillNonePanel = (await page.locator('[data-member-detail-store="none"]').count()) > 0;
  let storeName = "";
  let storeIdText = "";
  if (report.checks.hasStorePanel) {
    storeName = ((await page.locator("[data-member-store-name]").first().textContent({ timeout: 5000 }).catch(() => "")) || "").trim();
    storeIdText = ((await page.locator("[data-member-store-id]").first().textContent({ timeout: 5000 }).catch(() => "")) || "").trim();
  }
  report.checks.storeName = Boolean(storeName);
  report.checks.storeIdShown = storeId ? storeIdText.includes(storeId) : Boolean(storeIdText);
  if ((await page.locator('[data-member-cta="store_rel"]').count()) > 0) {
    await page.locator('[data-member-cta="store_rel"]').click();
    const owned = (await page.locator('[data-member-store-relation="owned"]').count()) > 0;
    const none = (await page.locator('[data-member-store-relation="none"]').count()) > 0;
    report.checks.s27Owned = owned;
    report.checks.s27OwnedOrNone = owned || none;
    report.checks.secondBlockedInDialog = (await page.locator('[data-member-store-rel-blocked="second"]').count()) > 0;
    if ((await page.locator("[data-member-admin-dialog-primary]").count()) > 0) {
      await page.locator("[data-member-admin-dialog-primary]").click();
    }
  } else {
    report.checks.storeRelCtaMissing = true;
  }

  if (storeId) {
    await page.goto(`${ORIGIN}/admin/business/${storeId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    const memberHref = await page.locator(`a[href="/admin/users/${userId}"]`).count();
    report.checks.storeToMember = memberHref > 0;
    await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
    if ((await page.locator('[data-member-tab="store"]').count()) > 0) {
      await page.locator('[data-member-tab="store"]').click();
      await page.waitForTimeout(600);
    }
    const toStore =
      (await page.locator(`[data-member-store-detail-cta="1"]`).count()) +
      (await page.locator(`a[href="/admin/business/${storeId}"]`).count()) +
      (await page.locator('[data-member-cta="store_detail"]').count());
    report.checks.memberToStore = toStore > 0;
  }

  // List consistency
  await page.goto(`${ORIGIN}/admin/users?q=${encodeURIComponent(username)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const listHasStore =
    (storeId
      ? (await page.locator(`a[href*="/admin/business/${storeId}"]`).count()) > 0 ||
        (await page.getByText(`#${storeId}`, { exact: false }).count()) > 0
      : false) ||
    (storeName ? (await page.getByText(storeName, { exact: false }).count()) > 0 : false) ||
    ((await page.locator('[data-member-list-store="1"]').count()) > 0 &&
      (await page.getByText("매장 없음").count()) === 0);
  report.checks.listMatches = listHasStore;

  // Integrity
  report.integrityAfter = await integrityCounts();
  report.checks.integrityNoMulti =
    report.integrityAfter.multiOwners === 0 && report.integrityAfter.nullOwner === 0;

  // CAP smoke on detail
  await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-member-detail-state="found"]', { timeout: 30000 });
  report.checks.r4PasswordCta = (await page.locator('[data-member-cta-cap="CAP-PASSWORD"]').count()) > 0;
  report.checks.r4DibayCta = (await page.locator('[data-member-cta-cap="CAP-DIBAY-ID"]').count()) > 0;

  const required = [
    "noStorePanel",
    "s27None",
    "attachBlocked",
    "memberLogin",
    "createRelation",
    "secondStoreRejected",
    "approvePending",
    "hasStorePanel",
    "storeName",
    "storeIdShown",
    "s27Owned",
    "memberToStore",
    "storeToMember",
    "listMatches",
    "integrityNoMulti",
  ];
  for (const key of required) {
    if (!report.checks[key]) report.failed.push(key);
  }
  report.result = report.failed.length === 0 ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, "r5-production.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        result: report.result,
        failed: report.failed,
        fixtureId: userId,
        storeId,
        integrityAfter: report.integrityAfter,
        reportPath: resolve(OUT, "r5-production.json"),
      },
      null,
      2,
    ),
  );
  await browser.close();
  process.exit(report.result === "PASS" ? 0 : 1);
}

main().catch((err) => {
  try {
    const reportPath = resolve(OUT, "r5-production.json");
    const prev = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : {};
    prev.result = "FAIL";
    prev.crash = String(err && err.stack ? err.stack : err);
    prev.finishedAt = new Date().toISOString();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(reportPath, JSON.stringify(prev, null, 2));
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
});
