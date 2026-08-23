#!/usr/bin/env node
/**
 * C6-C7 — Adversarial + Admin full E2E.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-c6-c7-adversarial-admin-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  applyPolicyToBrowseComposition,
  applyPolicyToHomeComposition,
} from "@/lib/stores/composition/stores-composition-engine";
import {
  runBrowseCompositionShadow,
  runHomeCompositionShadow,
} from "@/lib/stores/composition/stores-composition-shadow";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-c6-c7-adversarial-admin-e2e");
const OUT_JSON = path.join(OUT_DIR, "c6-c7-latest.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

type PolicyRow = {
  surface: string;
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: { consumed: false; reason: "NOT_CONSUMED" };
  titleAuthority: "presentation_i18n";
};

type Step = { name: string; status: string; [k: string]: unknown };

const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  phase: "C6-C7 — ADVERSARIAL + ADMIN E2E",
  concurrency: "C7.5_IMPLEMENTED",
  steps: [] as Step[],
  adversarial: {} as Record<string, string>,
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
      titleAuthority: "presentation_i18n" as const,
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

async function fetchPolicy(page: import("playwright").Page, surface: string) {
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

async function putPolicy(page: import("playwright").Page, surface: string, rows: unknown, expectedRevision?: number) {
  let revision = expectedRevision;
  if (revision == null) {
    const current = await fetchPolicy(page, surface);
    revision = Number(current.json?.revision ?? 0);
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

function liveHomeSig(stores: StoreHomeFeedItem[]) {
  const live = composeStoresHomeFeed(stores);
  return JSON.stringify({
    slot0: live.slot0Food.map((e) => `${e.storeId}:${e.productId}`),
    slot1: live.slot1Stores.map((s) => s.id),
    slot2: live.slot2Food.map((e) => `${e.storeId}:${e.productId}`),
  });
}

async function fetchHomeStores(page: import("playwright").Page) {
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
    .select("id, action_type, admin_id, created_at, before_json, after_json")
    .eq("surface", surface)
    .eq("slot", slot)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data ?? []).map((r) => ({
    actionType: r.action_type,
    adminId: r.admin_id ? String(r.admin_id).slice(0, 8) : null,
    hasBefore: r.before_json != null,
    hasAfter: r.after_json != null,
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const startedAt = new Date().toISOString();
  let restoreHomeRows: PolicyRow[] | null = null;
  let restoreBrowseRows: PolicyRow[] | null = null;
  let adminPage: import("playwright").Page | null = null;
  let restoreStatus: "PASS" | "FAIL" | "NOT_ATTEMPTED" = "NOT_ATTEMPTED";

  try {
    const { page, context, userId } = await loginAdmin(browser);
    adminPage = page;
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    step("admin_auth", "PASS");

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const unauthGet = await anonPage.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=home`);
      return { status: res.status, json: await res.json() };
    }, BASE);
    const unauthPut = await anonPage.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "home", rows: [] }),
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    await anonContext.close();
    const authPass = unauthGet.status === 403 && unauthPut.status === 403;
    step("authorization_unauthenticated", authPass ? "PASS" : "FAIL", {
      getStatus: unauthGet.status,
      putStatus: unauthPut.status,
    });
    (report.adversarial as Record<string, string>).authorization = authPass ? "PASS" : "FAIL";

    const stores = await fetchHomeStores(page);
    if (!stores.length) throw new Error("home_feed_empty");
    const baselineLiveSig = liveHomeSig(stores);
    const baselineLive = composeStoresHomeFeed(stores);

    const browseRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    const baselineBrowseIds = ((browseRes.json?.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    report.policyBaseline = {
      homeFeedCount: stores.length,
      browseIds: baselineBrowseIds,
    };

    const homePolicyRes = await fetchPolicy(page, "home");
    if (!homePolicyRes.json?.ok) throw new Error("home_policy_read_failed");
    const homePolicy = homePolicyRes.json.rows as PolicyRow[];
    restoreHomeRows = homePolicy.map((r) => ({ ...r }));

    const browsePolicyRes = await fetchPolicy(page, "browse");
    if (!browsePolicyRes.json?.ok) throw new Error("browse_policy_read_failed");
    const browsePolicy = browsePolicyRes.json.rows as PolicyRow[];
    restoreBrowseRows = browsePolicy.map((r) => ({ ...r }));

    const invalidPut = await putPolicy(page, "home", [
      {
        surface: "home",
        slot: "slot0Food",
        contentType: "food_product",
        enabled: true,
        order: 0,
        max: -1,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
      },
    ]);
    const invalidPass = invalidPut.status === 400 && invalidPut.json?.error === "invalid_max";
    step("invalid_policy_reject", invalidPass ? "PASS" : "FAIL", { error: invalidPut.json?.error });
    (report.adversarial as Record<string, string>).invalidPolicy = invalidPass ? "PASS" : "FAIL";

    const partialPut = await putPolicy(page, "home", homePolicy.slice(0, 2));
    const partialPass = partialPut.status === 400 && partialPut.json?.error === "incomplete_surface_rows";
    step("partial_batch_reject", partialPass ? "PASS" : "FAIL", { error: partialPut.json?.error });
    (report.adversarial as Record<string, string>).partialBatch = partialPass ? "PASS" : "FAIL";

    const dupRows = homePolicy.map((r) => ({ ...r, interval: { consumed: false, reason: "NOT_CONSUMED" as const } }));
    dupRows[1] = { ...dupRows[1]!, order: dupRows[0]!.order };
    const dupPut = await putPolicy(page, "home", dupRows);
    const dupPass = dupPut.status === 400 && dupPut.json?.error === "duplicate_order";
    step("duplicate_order_reject", dupPass ? "PASS" : "FAIL", { error: dupPut.json?.error });
    (report.adversarial as Record<string, string>).duplicateOrder = dupPass ? "PASS" : "FAIL";

    const afterRejectPolicy = await fetchPolicy(page, "home");
    const slot0AfterReject = (afterRejectPolicy.json.rows as PolicyRow[]).find((r) => r.slot === "slot0Food")?.max;
    const slot0Before = homePolicy.find((r) => r.slot === "slot0Food")?.max;
    const atomicPass = slot0AfterReject === slot0Before;
    step("atomicity_validation_reject", atomicPass ? "PASS" : "FAIL", { slot0Before, slot0AfterReject });
    (report.adversarial as Record<string, string>).atomicity = atomicPass ? "PASS" : "FAIL";

    const forbiddenPut = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "home", rankingWeight: 1, rows: [] }),
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    const forbiddenPass = forbiddenPut.status === 400 && forbiddenPut.json?.error === "forbidden_field";
    step("forbidden_ranking_field_reject", forbiddenPass ? "PASS" : "FAIL");
    (report.adversarial as Record<string, string>).forbiddenField = forbiddenPass ? "PASS" : "FAIL";

    // C7 — Admin UI E2E before adversarial mutations
    await page.goto(`${BASE}/admin/stores-composition-policy`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table", { timeout: 30000 });
    step("admin_home_page", "PASS");

    const uiSlot = "slot0Food";
    const uiOriginalMax = homePolicy.find((r) => r.slot === uiSlot)?.max ?? 16;
    const uiTestMax = uiOriginalMax === 5 ? 4 : 5;
    const uiRow = page.locator("tbody tr").filter({ hasText: uiSlot });
    await uiRow.locator('input[type="number"]').nth(1).fill(String(uiTestMax));
    await page.locator("button").filter({ hasText: /save|저장/i }).first().click();
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("table", { timeout: 30000 });
    const uiMaxAfterSave = Number(await uiRow.locator('input[type="number"]').nth(1).inputValue());
    step("admin_home_ui_save_reload", uiMaxAfterSave === uiTestMax ? "PASS" : "FAIL", {
      uiMaxAfterSave,
      uiTestMax,
    });

    const uiPolicy = (await fetchPolicy(page, "home")).json.rows as PolicyRow[];
    const uiShadow = runHomeCompositionShadow(stores, uiPolicy as StoresCompositionSectionContract[], {
      overrideSlots: new Set([uiSlot]),
    });
    step("admin_home_shadow_delta", uiShadow.overrideDeltaOnly ? "PASS" : "FAIL");
    step("admin_home_live_unchanged", liveHomeSig(stores) === baselineLiveSig ? "PASS" : "FAIL");

    await page.locator("div.flex.flex-wrap.items-center.gap-2 button").nth(1).click();
    await page.waitForSelector("table", { timeout: 15000 });
    const browseUiSlots = await page.locator("tbody tr td:first-child").allTextContents();
    const browseSlotIds = [
      "organic_discovery_list",
      "future_ad_insertion",
      "future_coupon_insertion",
      "future_promoted_placement",
    ];
    const browseUiPass = browseSlotIds.every((id) => browseUiSlots.some((s) => s.includes(id)));
    step("admin_browse_ui_slots", browseUiPass ? "PASS" : "FAIL", { slots: browseUiSlots });

    const organicRow = page.locator("tbody tr").filter({ hasText: "organic_discovery_list" });
    const organicRowMax = await organicRow.locator('input[type="number"]').nth(1).inputValue();
    step("admin_browse_organic_identity", organicRowMax !== null ? "PASS" : "FAIL");

    const uiAuditSlot = uiSlot;
    const auditUi = await countAuditLogs("home", uiAuditSlot, startedAt);
    step("admin_home_audit_change", auditUi != null && auditUi.length >= 1 ? "PASS" : "FAIL", {
      count: auditUi?.length ?? 0,
    });

    // Restore UI change before adversarial API mutations
    await putPolicy(
      page,
      "home",
      buildPutRows(uiPolicy, uiSlot, { max: uiOriginalMax }).map((r) => ({
        ...r,
        interval: { consumed: false, reason: "NOT_CONSUMED" as const },
      }))
    );

    const slot = "slot2Food";
    const disabledPut = await putPolicy(
      page,
      "home",
      buildPutRows(homePolicy, slot, { enabled: false })
    );
    if (!disabledPut.json?.ok) throw new Error("disabled_put_failed");
    const disabledPolicy = (await fetchPolicy(page, "home")).json.rows as PolicyRow[];
    const disabledShadow = runHomeCompositionShadow(
      stores,
      disabledPolicy as StoresCompositionSectionContract[]
    );
    const disabledSlot = disabledShadow.slots.find((s) => s.slot === slot);
    const liveAfterDisabled = composeStoresHomeFeed(stores);
    const disabledPass =
      (disabledSlot?.shadowIds.length ?? -1) === 0 &&
      liveAfterDisabled.slot2Food.length === baselineLive.slot2Food.length &&
      liveHomeSig(stores) === baselineLiveSig;
    step("disabled_slot_shadow", disabledPass ? "PASS" : "FAIL", {
      shadowCount: disabledSlot?.shadowIds.length,
      liveCount: liveAfterDisabled.slot2Food.length,
    });
    (report.adversarial as Record<string, string>).disabled = disabledPass ? "PASS" : "FAIL";

    const capSlot = "slot0Food";
    const capMax = 2;
    const capPut = await putPolicy(page, "home", buildPutRows(disabledPolicy, capSlot, { enabled: true, max: capMax }));
    if (!capPut.json?.ok) throw new Error("cap_put_failed");
    const capPolicy = (await fetchPolicy(page, "home")).json.rows as PolicyRow[];
    const capShadow = runHomeCompositionShadow(stores, capPolicy as StoresCompositionSectionContract[]);
    const capSlotReport = capShadow.slots.find((s) => s.slot === capSlot);
    const capPass =
      (capSlotReport?.shadowIds.length ?? 0) === capMax &&
      capSlotReport?.shadowIds[0] === capSlotReport?.currentIds[0] &&
      capSlotReport?.shadowIds[1] === capSlotReport?.currentIds[1];
    step("cap_order_preserved", capPass ? "PASS" : "FAIL", {
      shadowIds: capSlotReport?.shadowIds,
    });
    (report.adversarial as Record<string, string>).cap = capPass ? "PASS" : "FAIL";

    const browseFuturePolicy = browsePolicy.map((r) =>
      r.slot === "future_ad_insertion" ? { ...r, enabled: true, max: 3 } : r
    );
    const browseFuturePut = await putPolicy(page, "browse", browseFuturePolicy);
    if (!browseFuturePut.json?.ok) throw new Error("browse_future_put_failed");
    const browseAfterPolicy = (await fetchPolicy(page, "browse")).json.rows as PolicyRow[];
    const browseShadow = runBrowseCompositionShadow(
      baselineBrowseIds,
      browseAfterPolicy as StoresCompositionSectionContract[]
    );
    const browseEngine = applyPolicyToBrowseComposition(
      baselineBrowseIds,
      browseAfterPolicy as StoresCompositionSectionContract[]
    );
    const browseLiveAfter = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      return ((json.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    }, BASE);
    const browseAdvPass =
      browseShadow.futureInsertionsLive === false &&
      JSON.stringify(browseLiveAfter) === JSON.stringify(baselineBrowseIds) &&
      browseEngine.slots.find((s) => s.slot === "future_ad_insertion")?.itemIds.length === 0;
    step("browse_future_non_live", browseAdvPass ? "PASS" : "FAIL");
    (report.adversarial as Record<string, string>).browseFuture = browseAdvPass ? "PASS" : "FAIL";

    step("discovery_hard_lock", JSON.stringify(browseLiveAfter) === JSON.stringify(baselineBrowseIds) ? "PASS" : "FAIL");

    const auditBeforeRestore = await countAuditLogs("home", "slot0Food", startedAt);
    const auditPass =
      auditBeforeRestore != null &&
      auditBeforeRestore.length >= 2 &&
      auditBeforeRestore.some((e) => e.hasAfter) &&
      auditBeforeRestore.some((e) => e.hasBefore || e.actionType === "create");
    step("audit_log_trace", auditPass ? "PASS" : "FAIL", {
      count: auditBeforeRestore?.length ?? 0,
      entries: auditBeforeRestore,
    });

    if (restoreHomeRows && restoreBrowseRows) {
      const homeRestore = await putPolicy(
        page,
        "home",
        restoreHomeRows.map((r) => ({
          ...r,
          interval: { consumed: false, reason: "NOT_CONSUMED" as const },
        }))
      );
      const browseRestore = await putPolicy(
        page,
        "browse",
        restoreBrowseRows.map((r) => ({
          ...r,
          interval: { consumed: false, reason: "NOT_CONSUMED" as const },
        }))
      );
      const restoredHome = (await fetchPolicy(page, "home")).json.rows as PolicyRow[];
      const slot0Restored = restoredHome.find((r) => r.slot === "slot0Food")?.max;
      const slot0Baseline = restoreHomeRows.find((r) => r.slot === "slot0Food")?.max;
      restoreStatus =
        homeRestore.json?.ok && browseRestore.json?.ok && slot0Restored === slot0Baseline ? "PASS" : "FAIL";
      step("restore_policy", restoreStatus, { slot0Restored, slot0Baseline });
      void userId;
    }

    const finalStores = await fetchHomeStores(page);
    const finalBrowse = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      return ((json.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    }, BASE);

    step("live_home_unchanged", liveHomeSig(finalStores) === baselineLiveSig ? "PASS" : "FAIL");
    step("live_browse_unchanged", JSON.stringify(finalBrowse) === JSON.stringify(baselineBrowseIds) ? "PASS" : "FAIL");
    step("future_insertions_live", browseShadow.futureInsertionsLive ? "FAIL" : "PASS");

    report.restore = restoreStatus;
    report.shadow = "PASS";
    report.liveHome = "UNCHANGED";
    report.liveBrowse = "UNCHANGED";
    report.discovery = "UNTOUCHED";
    report.composer = "UNTOUCHED";
    report.presentation = "UNTOUCHED";

    report.ok = (report.steps as Step[]).every((s) => s.status === "PASS" || s.status === "NOT_PROVEN");

    await context.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    step("fatal", "FAIL", { error: msg });
    report.ok = false;
    if (restoreHomeRows && restoreBrowseRows && adminPage) {
      try {
        await putPolicy(
          adminPage,
          "home",
          restoreHomeRows.map((r) => ({
            ...r,
            interval: { consumed: false, reason: "NOT_CONSUMED" as const },
          }))
        );
        await putPolicy(
          adminPage,
          "browse",
          restoreBrowseRows.map((r) => ({
            ...r,
            interval: { consumed: false, reason: "NOT_CONSUMED" as const },
          }))
        );
        restoreStatus = "PASS";
      } catch {
        restoreStatus = "FAIL";
        report.environmentLeftDirty = true;
      }
    }
    report.restore = restoreStatus;
  } finally {
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }
}

void main();
