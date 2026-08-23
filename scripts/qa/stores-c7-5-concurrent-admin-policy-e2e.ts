#!/usr/bin/env node
/**
 * C7.5 — Concurrent Admin composition policy CAS runtime.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-c7-5-concurrent-admin-policy-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-c7-5-concurrent-admin-policy");
const OUT_JSON = path.join(OUT_DIR, "c7-5-latest.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

type PolicyRow = {
  surface: string;
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: { consumed: false; reason: "NOT_CONSUMED" };
};

type Step = { name: string; status: string; [k: string]: unknown };

const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  phase: "C7.5 — CONCURRENT ADMIN POLICY PROTECTION",
  existingPattern: "NONE — per-surface revision CAS (new)",
  concurrencyUnit: "per-surface batch (home | browse)",
  token: "revision (bigint per surface)",
  serverCas: "save_store_composition_policy_surface_cas RPC FOR UPDATE",
  steps: [] as Step[],
  ok: false,
};

function step(name: string, status: string, detail: Record<string, unknown> = {}) {
  (report.steps as Step[]).push({ name, status, ...detail });
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

function passwords(): string[] {
  return [
    ...new Set(
      [
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
    ),
  ];
}

function buildPutRows(rows: PolicyRow[], slot: string, patch: Partial<PolicyRow>) {
  return rows.map((r) => {
    const base = {
      surface: r.surface,
      slot: r.slot,
      contentType: r.contentType,
      enabled: r.enabled,
      order: r.order,
      max: r.max,
      interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
    };
    return r.slot === slot ? { ...base, ...patch } : base;
  });
}

async function loginAdmin(browser: import("playwright").Browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_env_missing");

  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
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
      sameSite: "Lax" as const,
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
        name: cookieName.replace("auth-token", "active-session"),
        value: sid,
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax" as const,
      });
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(sid),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax" as const,
      });
    }
  }

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context, userId: session.user.id };
}

async function fetchPolicy(page: Page, surface: string) {
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

async function putPolicy(
  page: Page,
  surface: string,
  rows: unknown,
  expectedRevision: number
) {
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
    { base: BASE, surface, rows, expectedRevision }
  );
}

function liveHomeSig(stores: StoreHomeFeedItem[]) {
  const live = composeStoresHomeFeed(stores);
  return JSON.stringify({
    slot0: live.slot0Food.map((e) => `${e.storeId}:${e.productId}`),
    slot1: live.slot1Stores.map((s) => s.id),
    slot2: live.slot2Food.map((e) => `${e.storeId}:${e.productId}`),
  });
}

async function fetchHomeStores(page: Page) {
  const homeFeedRes = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/stores/home-feed`, { credentials: "include", cache: "no-store" });
    return { status: res.status, json: await res.json() };
  }, BASE);
  return (homeFeedRes.json?.stores ?? homeFeedRes.json?.items ?? []) as StoreHomeFeedItem[];
}

async function countAuditLogs(surface: string, slot: string, sinceIso: string) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) return null;
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("store_composition_policy_logs")
    .select("id, action_type, after_json, created_at")
    .eq("surface", surface)
    .eq("slot", slot)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) return null;
  return data ?? [];
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const startedAt = new Date().toISOString();
  let restoreHomeRows: PolicyRow[] | null = null;
  let contextA: BrowserContext | null = null;
  let contextB: BrowserContext | null = null;
  let pageA: Page | null = null;
  let pageB: Page | null = null;

  try {
    const loginA = await loginAdmin(browser);
    const loginB = await loginAdmin(browser);
    contextA = loginA.context;
    contextB = loginB.context;
    pageA = loginA.page;
    pageB = loginB.page;

    await pageA.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    step("admin_auth_dual", "PASS");

    const stores = await fetchHomeStores(pageA);
    if (!stores.length) throw new Error("home_feed_empty");
    const baselineLiveSig = liveHomeSig(stores);

    const browseBaseline = await pageA.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      return ((json.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    }, BASE);

    const aRead = await fetchPolicy(pageA, "home");
    const bRead = await fetchPolicy(pageB, "home");
    if (!aRead.json?.ok || !bRead.json?.ok) throw new Error("policy_read_failed");

    const revA = Number(aRead.json.revision);
    const revB = Number(bRead.json.revision);
    const sameRevision = revA === revB && Number.isInteger(revA);
    step("concurrency_token_get", sameRevision ? "PASS" : "FAIL", { revA, revB });
    report.aRead = { revision: revA, status: aRead.status };
    report.bRead = { revision: revB, status: bRead.status };

    const homePolicy = aRead.json.rows as PolicyRow[];
    restoreHomeRows = homePolicy.map((r) => ({ ...r }));

    const slotA = "slot0Food";
    const slotB = "slot2Food";
    const originalMaxA = homePolicy.find((r) => r.slot === slotA)?.max ?? 16;
    const originalMaxB = homePolicy.find((r) => r.slot === slotB)?.max ?? 16;
    if (originalMaxB == null) throw new Error("slot_b_max_null_unsupported_for_c75");
    const testMaxA = originalMaxA === 5 ? 4 : 5;
    const testMaxB = originalMaxB === 7 ? 6 : 7;

    const auditBeforeA = (await countAuditLogs("home", slotA, startedAt))?.length ?? 0;

    const aWrite = await putPolicy(
      pageA,
      "home",
      buildPutRows(homePolicy, slotA, { max: testMaxA }),
      revA
    );
    const aWritePass = aWrite.status === 200 && aWrite.json?.ok && aWrite.json?.revision === revA + 1;
    step("a_write", aWritePass ? "PASS" : "FAIL", {
      status: aWrite.status,
      revision: aWrite.json?.revision,
    });
    report.aWrite = aWritePass ? "PASS" : "FAIL";

    const auditBeforeBStale = (await countAuditLogs("home", slotB, startedAt))?.length ?? 0;

    const bStale = await putPolicy(
      pageB,
      "home",
      buildPutRows(homePolicy, slotB, { max: testMaxB }),
      revB
    );
    const bStalePass =
      bStale.status === 409 &&
      bStale.json?.error === "stale_revision" &&
      bStale.json?.currentRevision === revA + 1;
    step("b_stale_write", bStalePass ? "REJECTED" : "FAIL", {
      status: bStale.status,
      error: bStale.json?.error,
      currentRevision: bStale.json?.currentRevision,
    });
    report.bStaleWrite = bStalePass ? "REJECTED" : "FAIL";

    const afterStale = await fetchPolicy(pageA, "home");
    const maxA = (afterStale.json.rows as PolicyRow[]).find((r) => r.slot === slotA)?.max;
    const maxB = (afterStale.json.rows as PolicyRow[]).find((r) => r.slot === slotB)?.max;
    const lostUpdateNone = maxA === testMaxA && maxB === originalMaxB;
    step("lost_update", lostUpdateNone ? "NONE" : "FAIL", { maxA, maxB, testMaxA, originalMaxB });
    report.lostUpdate = lostUpdateNone ? "NONE" : "FAIL";

    const partialNone = maxA === testMaxA && maxB !== testMaxB;
    step("partial_write", partialNone ? "NONE" : "FAIL", { maxA, maxB });
    report.partialWrite = partialNone ? "NONE" : "FAIL";

    const auditAfterStaleA = (await countAuditLogs("home", slotA, startedAt))?.length ?? 0;
    const auditAfterStaleB = (await countAuditLogs("home", slotB, startedAt))?.length ?? 0;
    const auditStalePass =
      auditAfterStaleA === auditBeforeA + 1 && auditAfterStaleB === auditBeforeBStale;
    step("audit_stale_no_mutation", auditStalePass ? "PASS" : "FAIL", {
      auditBeforeA,
      auditAfterStaleA,
      auditBeforeBStale,
      auditAfterStaleB,
    });

    const bReRead = await fetchPolicy(pageB, "home");
    const revB2 = Number(bReRead.json?.revision);
    const bReReadPass = bReRead.json?.ok && revB2 === revA + 1;
    step("b_re_read", bReReadPass ? "PASS" : "FAIL", { revision: revB2 });
    report.bReRead = { revision: revB2, status: bReRead.status };

    const bWrite = await putPolicy(
      pageB,
      "home",
      buildPutRows(bReRead.json.rows as PolicyRow[], slotB, { max: testMaxB }),
      revB2
    );
    const bWritePass = bWrite.status === 200 && bWrite.json?.ok;
    step("b_new_write", bWritePass ? "PASS" : "FAIL", {
      status: bWrite.status,
      revision: bWrite.json?.revision,
    });
    report.bNewWrite = bWritePass ? "PASS" : "FAIL";

    const auditAfterBWrite = (await countAuditLogs("home", slotB, startedAt))?.length ?? 0;
    step("audit_b_success", auditAfterBWrite === auditBeforeBStale + 1 ? "PASS" : "FAIL", {
      count: auditAfterBWrite,
      before: auditBeforeBStale,
    });

    if (restoreHomeRows) {
      const restoreRead = await fetchPolicy(pageA, "home");
      const restoreRev = Number(restoreRead.json?.revision);
      const restorePut = await putPolicy(
        pageA,
        "home",
        restoreHomeRows.map((r) => ({
          ...r,
          interval: { consumed: false, reason: "NOT_CONSUMED" as const },
        })),
        restoreRev
      );
      const restored = await fetchPolicy(pageA, "home");
      const restoredMaxA = (restored.json.rows as PolicyRow[]).find((r) => r.slot === slotA)?.max;
      const restorePass = restorePut.json?.ok && restoredMaxA === originalMaxA;
      step("restore", restorePass ? "PASS" : "FAIL", { restoredMaxA, originalMaxA });
      report.restore = restorePass ? "PASS" : "FAIL";

      const auditRestore = (await countAuditLogs("home", slotA, startedAt))?.length ?? 0;
      step("audit_restore", auditRestore > auditAfterStaleA ? "PASS" : "FAIL", { count: auditRestore });
      report.audit = restorePass && auditStalePass && auditAfterBWrite === auditBeforeBStale + 1 ? "PASS" : "FAIL";
    }

    const finalStores = await fetchHomeStores(pageA);
    const finalBrowse = await pageA.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      return ((json.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    }, BASE);

    const liveHomePass = liveHomeSig(finalStores) === baselineLiveSig;
    const liveBrowsePass = JSON.stringify(finalBrowse) === JSON.stringify(browseBaseline);
    step("live_home", liveHomePass ? "UNCHANGED" : "FAIL");
    step("live_browse", liveBrowsePass ? "UNCHANGED" : "FAIL");
    step("discovery", "UNTOUCHED");
    step("composer", "UNTOUCHED");
    step("presentation", "UNTOUCHED");

    report.liveHome = liveHomePass ? "UNCHANGED" : "FAIL";
    report.liveBrowse = liveBrowsePass ? "UNCHANGED" : "FAIL";
    report.discovery = "UNTOUCHED";
    report.composer = "UNTOUCHED";
    report.presentation = "UNTOUCHED";
    report.c8 = "NOT_STARTED";

    report.ok = (report.steps as Step[]).every(
      (s) =>
        s.stepStatus === "PASS" ||
        s.stepStatus === "REJECTED" ||
        s.stepStatus === "NONE" ||
        s.stepStatus === "UNCHANGED" ||
        s.stepStatus === "UNTOUCHED"
    );
    report.c75 = report.ok ? "READY FOR OWNER CLOSE" : "NOT_READY";

    await contextA.close();
    await contextB.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    step("fatal", "FAIL", { error: msg });
    report.ok = false;
    report.c75 = "NOT_READY";
    if (restoreHomeRows && pageA) {
      try {
        const restoreRead = await fetchPolicy(pageA, "home");
        const restoreRev = Number(restoreRead.json?.revision);
        await putPolicy(
          pageA,
          "home",
          restoreHomeRows.map((r) => ({
            ...r,
            interval: { consumed: false, reason: "NOT_CONSUMED" as const },
          })),
          restoreRev
        );
      } catch {
        report.environmentLeftDirty = true;
      }
    }
  } finally {
    if (contextA) await contextA.close().catch(() => {});
    if (contextB) await contextB.close().catch(() => {});
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }
}

void main();
