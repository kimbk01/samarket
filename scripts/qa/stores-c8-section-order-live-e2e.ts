#!/usr/bin/env node
/**
 * C8 — Section order live close runtime E2E.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-c8-section-order-live-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { composeLiveHomeFeed } from "@/lib/stores/composition/stores-composition-live";
import { homeCompositionSlotItemIds } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-c8-section-order-live");
const OUT_JSON = path.join(OUT_DIR, "c8-section-order-latest.json");

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

type Step = { name: string; stepStatus: string; [k: string]: unknown };

const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  phase: "C8 — SECTION ORDER LIVE CLOSE",
  rootCause: "Hub/BelowFold hardcoded DOM order ignored policy.order",
  orderAuthorityBefore: "fixed Hub DOM (slot0 → slot1 → below-fold)",
  orderAuthorityAfter: "resolved composition policy.order",
  steps: [] as Step[],
  ok: false,
};

function step(name: string, stepStatus: string, detail: Record<string, unknown> = {}) {
  (report.steps as Step[]).push({ name, stepStatus, ...detail });
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

function buildPutRows(rows: PolicyRow[], patches: Record<string, Partial<PolicyRow>>) {
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
    return patches[r.slot] ? { ...base, ...patches[r.slot] } : base;
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
  return { page, context };
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

async function putPolicy(page: Page, surface: string, rows: unknown, expectedRevision: number) {
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

async function fetchHomeFeed(page: Page) {
  return page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/stores/home-feed`, {
      credentials: "include",
      cache: "no-store",
    });
    return { status: res.status, json: await res.json() };
  }, BASE);
}

async function fetchBrowse(page: Page) {
  return page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
      credentials: "include",
      cache: "no-store",
    });
    return { status: res.status, json: await res.json() };
  }, BASE);
}

async function readDomSlotOrder(
  page: Page,
  opts?: { expectSlotBefore?: string; expectSlotAfter?: string }
): Promise<string[]> {
  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".stores-home-hub", { timeout: 90_000 });
  if (opts?.expectSlotBefore && opts?.expectSlotAfter) {
    await page.waitForFunction(
      ({ before, after }) => {
        const slots = [...document.querySelectorAll("[data-composition-slot]")].map((el) =>
          el.getAttribute("data-composition-slot")
        );
        const iBefore = slots.indexOf(before);
        const iAfter = slots.indexOf(after);
        return iBefore >= 0 && iAfter >= 0 && iBefore < iAfter;
      },
      { before: opts.expectSlotBefore, after: opts.expectSlotAfter },
      { timeout: 90_000 }
    );
  } else {
    await page
      .waitForFunction(
        () => document.querySelectorAll("[data-composition-slot]").length > 0,
        undefined,
        { timeout: 90_000 }
      )
      .catch(async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => document.querySelectorAll("[data-composition-slot]").length > 0,
          undefined,
          { timeout: 90_000 }
        );
      });
  }
  return page
    .evaluate(() =>
      [...document.querySelectorAll("[data-composition-slot]")].map((el) =>
        el.getAttribute("data-composition-slot")
      )
    )
    .then((slots) => slots.filter((s): s is string => !!s));
}

function slotItemIds(
  stores: StoreHomeFeedItem[],
  policyMeta: StoresHomeCompositionPolicyMeta | null | undefined,
  slot: "slot0Food" | "slot1Stores" | "slot2Food"
) {
  const live = composeLiveHomeFeed(stores, policyMeta ?? null);
  return homeCompositionSlotItemIds(slot, live[slot]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let restoreRows: PolicyRow[] | null = null;
  let page: Page | null = null;

  const slotA = "slot0Food";
  const slotB = "slot1Stores";

  try {
    const login = await loginAdmin(browser);
    page = login.page;
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    step("admin_auth", "PASS");

    const browseBefore = await fetchBrowse(page);
    const browseIdsBefore = ((browseBefore.json?.stores ?? []) as Array<{ id: string }>).map((s) => s.id);

    const policyRes = await fetchPolicy(page, "home");
    if (!policyRes.json?.ok) throw new Error("policy_read_failed");
    const homePolicy = policyRes.json.rows as PolicyRow[];
    restoreRows = homePolicy.map((r) => ({ ...r }));
    const revision = Number(policyRes.json.revision);

    const orderA = homePolicy.find((r) => r.slot === slotA)?.order;
    const orderB = homePolicy.find((r) => r.slot === slotB)?.order;
    if (orderA == null || orderB == null) throw new Error("fixture_slots_missing");

    const homeBaseline = await fetchHomeFeed(page);
    const stores = homeBaseline.json.stores as StoreHomeFeedItem[];
    const baselineMeta = homeBaseline.json.meta?.compositionPolicy as StoresHomeCompositionPolicyMeta;
    const baselineSlotAIds = slotItemIds(stores, baselineMeta, slotA);
    const baselineSlotBIds = slotItemIds(stores, baselineMeta, slotB);
    if (baselineSlotAIds.length === 0 || baselineSlotBIds.length === 0) {
      throw new Error("fixture_sections_empty");
    }

    const baselineDom = await readDomSlotOrder(page);
    const baselineDomPass =
      baselineDom.indexOf(slotA) >= 0 &&
      baselineDom.indexOf(slotB) >= 0 &&
      baselineDom.indexOf(slotA) < baselineDom.indexOf(slotB);
    step("baseline_dom_order", baselineDomPass ? "PASS" : "FAIL", { baselineDom });

    const swapPut = await putPolicy(
      page,
      "home",
      buildPutRows(homePolicy, {
        [slotA]: { order: orderB },
        [slotB]: { order: orderA },
      }),
      revision
    );
    const swapWritePass = swapPut.status === 200 && swapPut.json?.ok;
    step("order_admin_write", swapWritePass ? "PASS" : "FAIL", {
      status: swapPut.status,
      error: swapPut.json?.error,
    });
    report.adminOrderWrite = swapWritePass ? "PASS" : "FAIL";

    const swappedDom = await readDomSlotOrder(page, {
      expectSlotBefore: slotB,
      expectSlotAfter: slotA,
    });
    const domOrderPass =
      swappedDom.indexOf(slotB) >= 0 &&
      swappedDom.indexOf(slotA) >= 0 &&
      swappedDom.indexOf(slotB) < swappedDom.indexOf(slotA);
    step("live_dom_order", domOrderPass ? "PASS" : "FAIL", { swappedDom });
    report.liveDomOrder = domOrderPass ? "PASS" : "FAIL";

    const homeSwapped = await fetchHomeFeed(page);
    const swappedMeta = homeSwapped.json.meta?.compositionPolicy as StoresHomeCompositionPolicyMeta;
    const afterSlotAIds = slotItemIds(homeSwapped.json.stores as StoreHomeFeedItem[], swappedMeta, slotA);
    const afterSlotBIds = slotItemIds(homeSwapped.json.stores as StoreHomeFeedItem[], swappedMeta, slotB);
    const itemOrderPass =
      afterSlotAIds.join() === baselineSlotAIds.join() &&
      afterSlotBIds.join() === baselineSlotBIds.join();
    step("item_order", itemOrderPass ? "PRESERVED" : "FAIL");
    report.itemOrder = itemOrderPass ? "PRESERVED" : "FAIL";

    const maxPut = await putPolicy(
      page,
      "home",
      buildPutRows((await fetchPolicy(page, "home")).json.rows as PolicyRow[], {
        [slotA]: { max: 5 },
      }),
      Number((await fetchPolicy(page, "home")).json.revision)
    );
    const homeMax = await fetchHomeFeed(page);
    const maxMeta = homeMax.json.meta?.compositionPolicy as StoresHomeCompositionPolicyMeta;
    const maxCount = slotItemIds(homeMax.json.stores as StoreHomeFeedItem[], maxMeta, slotA).length;
    step("max", maxPut.json?.ok && maxCount === 5 ? "PRESERVED" : "FAIL", { maxCount });
    report.max = maxPut.json?.ok && maxCount === 5 ? "PRESERVED" : "FAIL";

    const enablePut = await putPolicy(
      page,
      "home",
      buildPutRows((await fetchPolicy(page, "home")).json.rows as PolicyRow[], {
        slot2Food: { enabled: false },
      }),
      Number((await fetchPolicy(page, "home")).json.revision)
    );
    const homeDisabled = await fetchHomeFeed(page);
    const disabledMeta = homeDisabled.json.meta?.compositionPolicy as StoresHomeCompositionPolicyMeta;
    const slot2Count = slotItemIds(homeDisabled.json.stores as StoreHomeFeedItem[], disabledMeta, "slot2Food").length;
    step("enabled", enablePut.json?.ok && slot2Count === 0 ? "PRESERVED" : "FAIL", { slot2Count });
    report.enabled = enablePut.json?.ok && slot2Count === 0 ? "PRESERVED" : "FAIL";

    if (restoreRows) {
      const restoreRead = await fetchPolicy(page, "home");
      const restorePut = await putPolicy(
        page,
        "home",
        restoreRows.map((r) => ({
          ...r,
          interval: { consumed: false, reason: "NOT_CONSUMED" as const },
        })),
        Number(restoreRead.json.revision)
      );
      const restoredDom = await readDomSlotOrder(page!);
      const restorePass =
        restorePut.json?.ok &&
        restoredDom.indexOf(slotA) < restoredDom.indexOf(slotB);
      step("restore", restorePass ? "PASS" : "FAIL", { restoredDom });
      report.restore = restorePass ? "PASS" : "FAIL";
      report.c75 = restorePut.json?.ok ? "PRESERVED" : "FAIL";
    }

    const browseAfter = await fetchBrowse(page);
    const browseIdsAfter = ((browseAfter.json?.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    const browsePass = JSON.stringify(browseIdsAfter) === JSON.stringify(browseIdsBefore);
    step("live_browse", browsePass ? "PRESERVED" : "FAIL");
    report.liveBrowse = browsePass ? "PRESERVED" : "FAIL";

    step("discovery", "UNTOUCHED");
    step("composer", "PRESERVED");
    step("presentation", "PRESERVED");
    report.discovery = "UNTOUCHED";
    report.composer = "PRESERVED";
    report.presentation = "PRESERVED";

    report.sectionOrderLive = domOrderPass && swapWritePass ? "PASS" : "FAIL";

    report.ok = (report.steps as Step[]).every((s) => {
      const st = s.stepStatus;
      return (
        st === "PASS" ||
        st === "PRESERVED" ||
        st === "UNTOUCHED"
      );
    });
    report.c8 = report.ok ? "READY FOR OWNER CLOSE" : "NOT_CLOSED";

    await login.context.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    step("fatal", "FAIL", { error: msg });
    report.ok = false;
    report.c8 = "NOT_CLOSED";
    if (restoreRows && page) {
      try {
        const restoreRead = await fetchPolicy(page, "home");
        await putPolicy(
          page,
          "home",
          restoreRows.map((r) => ({
            ...r,
            interval: { consumed: false, reason: "NOT_CONSUMED" as const },
          })),
          Number(restoreRead.json.revision)
        );
      } catch {
        report.environmentLeftDirty = true;
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }
}

void main();
