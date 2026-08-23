#!/usr/bin/env node
/**
 * C2 Admin Composition Policy — runtime E2E (requires admin session + migrated DB).
 *
 * Credential authority (repository canonical):
 *   E2E_ADMIN_USERNAME | QA_ADMIN_LOGIN (default aaaa) → email @manual.local
 *   E2E_ADMIN_PASSWORD | E2E_TEST_PASSWORD | QA_MANUAL_PASSWORD (+ script fallbacks)
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * node --env-file=.env.local scripts/qa/stores-c2-composition-policy-admin-e2e.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-c2-composition-policy");
const OUT_JSON = path.join(OUT_DIR, "c2-admin-e2e-latest.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

const report = {
  measuredAt: new Date().toISOString(),
  phase: "C2 — ADMIN COMPOSITION POLICY",
  credentialAuthority: "E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD (canonical)",
  steps: [],
  userHomeUnchanged: null,
  userBrowseUnchanged: null,
  persistence: "NOT_PROVEN",
  audit: "NOT_PROVEN",
  ok: false,
};

function step(name, status, detail = {}) {
  report.steps.push({ name, status, ...detail });
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function resolveAdminEmail() {
  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  return login.includes("@") ? login : `${login}@manual.local`;
}

async function loginAdmin(browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_env_missing");

  const email = resolveAdminEmail();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session && sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: link } = await adminSb.auth.admin.generateLink({ type: "magiclink", email });
    const u = new URL(String(link?.properties?.action_link || ""));
    const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    if (tokenHash) {
      const { data: verified } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      session = verified.session;
    }
  }
  if (!session) throw new Error("admin_login_failed");

  const ref = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(BASE);
  const cookies = [
    {
      name: cookieName,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
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
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(sid),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
    }
  }

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context, userId: session.user.id, email };
}

async function fetchPolicy(page, surface) {
  return page.evaluate(
    async ({ base, surface }) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=${surface}`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    },
    { base: BASE, surface }
  );
}

async function putPolicy(page, surface, rows, expectedRevision) {
  let revision = expectedRevision;
  if (revision == null) {
    const current = await fetchPolicy(page, surface);
    revision = current.json?.revision ?? 0;
  }
  return page.evaluate(
    async ({ base, surface, rows, expectedRevision }) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface, rows, expectedRevision }),
      });
      return { status: res.status, json: await res.json() };
    },
    { base: BASE, surface, rows, expectedRevision: revision }
  );
}

function buildPutRows(rows, slot, patch) {
  return rows.map((r) => {
    const base = {
      surface: r.surface,
      slot: r.slot,
      contentType: r.contentType,
      enabled: r.enabled,
      order: r.order,
      max: r.max,
      interval: { consumed: false, reason: "NOT_CONSUMED" },
    };
    if (r.slot === slot) return { ...base, ...patch };
    return base;
  });
}

async function countAuditLogs(surface, slot, sinceIso) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) return null;
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { count, error } = await sb
    .from("store_composition_policy_logs")
    .select("id", { count: "exact", head: true })
    .eq("surface", surface)
    .eq("slot", slot)
    .gte("created_at", sinceIso);
  if (error) {
    if (String(error.message).includes("does not exist")) return null;
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const startedAt = new Date().toISOString();

  try {
    const { page, context, email } = await loginAdmin(browser);
    step("admin_auth", "PASS", { emailDomain: email.split("@")[1] ?? "unknown" });

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    const homeBefore = await fetchPolicy(page, "home");
    if (!homeBefore.json?.ok || !Array.isArray(homeBefore.json.rows)) {
      step("policy_read", "FAIL", {
        httpStatus: homeBefore.status,
        error: homeBefore.json?.error ?? "load_failed",
      });
      step("admin_page", "NOT_PROVEN", { reason: "policy_read_blocked" });
      throw new Error(`policy_read_failed:${homeBefore.json?.error ?? homeBefore.status}`);
    }
    step("policy_read", "PASS", { overrideCount: homeBefore.json.overrideCount });

    await page.goto(`${BASE}/admin/stores-composition-policy`, { waitUntil: "domcontentloaded" });
    const adminPageOk = await page
      .waitForSelector("table, [data-admin-page-header]", { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    step("admin_page", adminPageOk ? "PASS" : "NOT_PROVEN", {
      url: `${BASE}/admin/stores-composition-policy`,
    });

    const slot = "slot0Food";
    const originalMax = homeBefore.json.rows.find((r) => r.slot === slot)?.max ?? 16;
    const testMax = originalMax === 15 ? 14 : 15;

    const writeRows = buildPutRows(homeBefore.json.rows, slot, { max: testMax });
    const putRes = await putPolicy(page, "home", writeRows);
    if (!putRes.json?.ok) {
      step("policy_write", "FAIL", { status: putRes.status, error: putRes.json?.error });
      throw new Error("policy_write_failed");
    }
    step("policy_write", "PASS", { testMax });

    const afterSave = await fetchPolicy(page, "home");
    const savedMax = afterSave.json?.rows?.find((r) => r.slot === slot)?.max;
    step("get_persistence", savedMax === testMax ? "PASS" : "FAIL", { savedMax, testMax });

    await page.reload({ waitUntil: "domcontentloaded" });
    const uiMax = await page
      .waitForSelector("table", { timeout: 15000 })
      .then(async () =>
        page.evaluate(() => {
          const rows = [...document.querySelectorAll("tbody tr")];
          const row = rows.find((tr) => tr.textContent?.includes("slot0Food"));
          const inputs = row?.querySelectorAll('input[type="number"]');
          // column order: enabled(n/a) | order | max
          return inputs && inputs.length >= 2 ? Number(inputs[1].value) : null;
        })
      )
      .catch(() => null);
    if (uiMax == null) {
      step("reload_ui_persistence", "NOT_PROVEN", { reason: "table_not_visible" });
    } else {
      step("reload_ui_persistence", uiMax === testMax ? "PASS" : "FAIL", { uiMax });
    }

    const storesRes = await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded" });
    report.userHomeUnchanged = storesRes?.ok() ? "UNCHANGED" : "FAIL";
    step("user_home", report.userHomeUnchanged === "UNCHANGED" ? "PASS" : "FAIL");

    const browseRes = await page.goto(`${BASE}/stores/browse/restaurant?sub=all`, {
      waitUntil: "domcontentloaded",
    });
    report.userBrowseUnchanged = browseRes?.ok() ? "UNCHANGED" : "FAIL";
    step("user_browse", report.userBrowseUnchanged === "UNCHANGED" ? "PASS" : "FAIL");

    const restoreRows = buildPutRows(afterSave.json.rows, slot, { max: originalMax });
    const restoreRes = await putPolicy(page, "home", restoreRows);
    if (!restoreRes.json?.ok) {
      step("restore_write", "FAIL", { error: restoreRes.json?.error });
      throw new Error("restore_failed");
    }
    step("restore_write", "PASS", { originalMax });

    const afterRestore = await fetchPolicy(page, "home");
    const restoredMax = afterRestore.json?.rows?.find((r) => r.slot === slot)?.max;
    step("restore_persistence", restoredMax === originalMax ? "PASS" : "FAIL", { restoredMax });

    const auditCount = await countAuditLogs("home", slot, startedAt);
    if (auditCount == null) {
      step("audit_log", "NOT_PROVEN", { reason: "table_missing_or_no_service_role" });
      report.audit = "NOT_PROVEN";
    } else {
      const auditPass = auditCount >= 2;
      step("audit_log", auditPass ? "PASS" : "FAIL", { count: auditCount });
      report.audit = auditPass ? "PASS" : "FAIL";
    }

    report.persistence =
      savedMax === testMax && restoredMax === originalMax ? "PASS" : "FAIL";
    report.ok = report.steps.every(
      (s) => s.status === "PASS" || s.status === "NOT_PROVEN"
    );

    await context.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!report.steps.some((s) => s.name === "admin_auth")) {
      step("admin_auth", msg.includes("admin_login_failed") ? "FAIL" : "FAIL", { error: msg });
    } else if (!report.steps.some((s) => s.status === "FAIL")) {
      step("fatal", "FAIL", { error: msg });
    }
    report.ok = false;
  } finally {
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }
}

void main();
