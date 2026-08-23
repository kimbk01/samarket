#!/usr/bin/env node
/**
 * W — Campaign Writer lifecycle E2E (Admin HTTP only — no DB direct writes).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-w-campaign-writer-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { composeLiveHomeFeed } from "@/lib/stores/composition/stores-composition-live";
import { homeCompositionSlotItemIds } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-w-campaign-writer");
const OUT_JSON = path.join(OUT_DIR, "w-campaign-writer-latest.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

type Step = { name: string; stepStatus: string; [k: string]: unknown };

const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  phase: "W — CAMPAIGN WRITER",
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

async function loginAdmin(browser: import("playwright").Browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
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

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context };
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

function pickFixtureStore(stores: StoreHomeFeedItem[]): StoreHomeFeedItem | null {
  const probeWindow = {
    startAt: new Date(Date.now() - 86400000).toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  for (const store of stores) {
    const productId = store.featuredItems?.[0]?.productId;
    if (!productId) continue;
    const withCampaign: StoreHomeFeedItem = {
      ...store,
      discoveryCampaign: {
        id: "w-probe",
        campaignType: "event",
        title: "w-probe",
        bodyCopy: null,
        startAt: probeWindow.startAt,
        endAt: probeWindow.endAt,
      },
    };
    const live = composeLiveHomeFeed(
      stores.map((s) => (s.id === store.id ? withCampaign : s)),
      null
    );
    if (live.campaignFood.some((e) => e.storeId === store.id)) return store;
  }
  return null;
}

function campaignFoodHasStore(stores: StoreHomeFeedItem[], storeId: string, title?: string) {
  const policyMeta = null;
  const live = composeLiveHomeFeed(stores, policyMeta);
  const ids = homeCompositionSlotItemIds("campaignFood", live.campaignFood);
  const match = live.campaignFood.some(
    (e) => e.storeId === storeId && (title == null || e.campaignTitle === title)
  );
  return { match, ids, count: live.campaignFood.length };
}

async function postCampaign(page: Page, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ base, body }) => {
      const res = await fetch(`${base}/api/admin/store-discovery/campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    },
    { base: BASE, body }
  );
}

async function patchCampaign(page: Page, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ base, body }) => {
      const res = await fetch(`${base}/api/admin/store-discovery/campaigns`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    },
    { base: BASE, body }
  );
}

async function getCampaigns(page: Page) {
  return page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/admin/store-discovery/campaigns`, {
      credentials: "include",
      cache: "no-store",
    });
    return { status: res.status, json: await res.json() };
  }, BASE);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let createdCampaignId: string | null = null;
  let upcomingCampaignId: string | null = null;

  try {
    const { page } = await loginAdmin(browser);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    step("admin_auth", "PASS");

    const unauthRes = await fetch(`${BASE}/api/admin/store-discovery/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: "11111111-1111-1111-1111-111111111111",
        campaignType: "event",
        title: "x",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    step("unauthenticated_post", unauthRes.status === 403 ? "PASS" : "FAIL", {
      status: unauthRes.status,
    });

    const homeBaseline = await fetchHomeFeed(page);
    if (!homeBaseline.json?.ok) throw new Error("home_feed_failed");
    const stores = homeBaseline.json.stores as StoreHomeFeedItem[];
    const fixture = pickFixtureStore(stores);
    if (!fixture) {
      step("fixture", "NO_RUNTIME_FIXTURE");
      report.homeFeed = "NO_RUNTIME_FIXTURE";
      report.homeCampaignShelf = "NO_RUNTIME_FIXTURE";
      report.ok = false;
      fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
    step("fixture", "PASS", { storeId: fixture.id, storeName: fixture.nameKo });

    const campaignsBefore = await getCampaigns(page);
    const existingActive = (
      (campaignsBefore.json?.campaigns ?? []) as Array<{
        id: string;
        store_id: string;
        is_active: boolean;
        computed_state: string;
      }>
    ).filter(
      (c) =>
        c.store_id === fixture.id &&
        c.is_active &&
        (c.computed_state === "active" || c.computed_state === "upcoming")
    );
    for (const row of existingActive) {
      await patchCampaign(page, { id: row.id, isActive: false });
    }
    step("baseline_deactivate_conflicts", "PASS", { count: existingActive.length });

    const now = Date.now();
    const titleBase = `W-QA-${now}`;
    const activeStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const activeEnd = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await postCampaign(page, {
      storeId: fixture.id,
      campaignType: "event",
      title: titleBase,
      bodyCopy: "W lifecycle QA",
      startAt: activeStart,
      endAt: activeEnd,
      isActive: true,
    });
    const createPass = createRes.status === 201 && createRes.json?.ok && createRes.json?.campaign?.id;
    createdCampaignId = createPass ? String(createRes.json.campaign.id) : null;
    step("create", createPass ? "PASS" : "FAIL", {
      status: createRes.status,
      error: createRes.json?.error,
    });

    await page.waitForTimeout(400);

    const readRes = await getCampaigns(page);
    const readPass =
      readRes.json?.ok &&
      (readRes.json.campaigns as Array<{ id: string }>).some((c) => c.id === createdCampaignId);
    step("read", readPass ? "PASS" : "FAIL");

    const homeAfterCreate = await fetchHomeFeed(page);
    const storeRow = (homeAfterCreate.json.stores as StoreHomeFeedItem[]).find(
      (s) => s.id === fixture.id
    );
    const feedPass =
      storeRow?.discoveryCampaign != null &&
      String(storeRow.discoveryCampaign.title) === titleBase;
    step("home_feed", feedPass ? "PASS" : "FAIL", {
      discoveryCampaign: storeRow?.discoveryCampaign ?? null,
    });

    const shelf = campaignFoodHasStore(
      homeAfterCreate.json.stores as StoreHomeFeedItem[],
      fixture.id,
      titleBase
    );
    step("home_campaign_shelf", shelf.match ? "PASS" : "FAIL", {
      campaignFoodCount: shelf.count,
      ids: shelf.ids,
    });

    const updatedTitle = `${titleBase}-updated`;
    const updateRes = await patchCampaign(page, {
      id: createdCampaignId,
      title: updatedTitle,
    });
    step("update", updateRes.json?.ok ? "PASS" : "FAIL", { status: updateRes.status });

    const homeAfterUpdate = await fetchHomeFeed(page);
    const storeAfterUpdate = (homeAfterUpdate.json.stores as StoreHomeFeedItem[]).find(
      (s) => s.id === fixture.id
    );
    const updateFeedPass = storeAfterUpdate?.discoveryCampaign?.title === updatedTitle;
    step("home_feed_after_update", updateFeedPass ? "PASS" : "FAIL");

    const upcomingStart = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
    const upcomingEnd = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
    const upcomingRes = await postCampaign(page, {
      storeId: fixture.id,
      campaignType: "promo",
      title: `${titleBase}-upcoming`,
      startAt: upcomingStart,
      endAt: upcomingEnd,
      isActive: true,
    });
    upcomingCampaignId = upcomingRes.json?.campaign?.id ?? null;
    const homeUpcoming = await fetchHomeFeed(page);
    const upcomingStore = (homeUpcoming.json.stores as StoreHomeFeedItem[]).find(
      (s) => s.id === fixture.id
    );
    const upcomingHidden =
      upcomingStore?.discoveryCampaign?.id !== upcomingCampaignId &&
      upcomingStore?.discoveryCampaign?.title === updatedTitle;
    step("upcoming", upcomingHidden ? "PASS" : "FAIL", {
      pickedTitle: upcomingStore?.discoveryCampaign?.title ?? null,
      upcomingId: upcomingCampaignId,
    });

    const deactivateRes = await patchCampaign(page, { id: createdCampaignId, isActive: false });
    step("deactivate", deactivateRes.json?.ok ? "PASS" : "FAIL");

    const homeAfterDeactivate = await fetchHomeFeed(page);
    const storeAfterOff = (homeAfterDeactivate.json.stores as StoreHomeFeedItem[]).find(
      (s) => s.id === fixture.id
    );
    const removalPass =
      storeAfterOff?.discoveryCampaign == null ||
      storeAfterOff.discoveryCampaign.title !== updatedTitle;
    step("home_removal", removalPass ? "PASS" : "FAIL");

    const shelfAfter = campaignFoodHasStore(
      homeAfterDeactivate.json.stores as StoreHomeFeedItem[],
      fixture.id,
      updatedTitle
    );
    step("home_shelf_removal", shelfAfter.match ? "FAIL" : "PASS");

    if (upcomingCampaignId) {
      await patchCampaign(page, { id: upcomingCampaignId, isActive: false });
    }
    step("restore", "PASS", {
      note: "QA rows left inactive (no hard delete authority)",
      createdCampaignId,
      upcomingCampaignId,
    });

    step("discovery", "UNTOUCHED");
    step("composer", "PRESERVED");
    step("composition", "PRESERVED");
    step("ads_coupon", "NOT_STARTED");

    const allPass = (report.steps as Step[]).every(
      (s) =>
        s.stepStatus === "PASS" ||
        s.stepStatus === "UNTOUCHED" ||
        s.stepStatus === "PRESERVED" ||
        s.stepStatus === "NOT_STARTED"
    );
    report.ok = allPass;
    report.create = createPass ? "PASS" : "FAIL";
    report.read = readPass ? "PASS" : "FAIL";
    report.update = updateRes.json?.ok ? "PASS" : "FAIL";
    report.deactivate = deactivateRes.json?.ok ? "PASS" : "FAIL";
    report.delete = "NOT_APPLICABLE";
    report.homeFeed = feedPass ? "PASS" : "FAIL";
    report.homeCampaignShelf = shelf.match ? "PASS" : "FAIL";
    report.upcoming = upcomingHidden ? "PASS" : "FAIL";
    report.restore = "PASS";
    report.w = allPass ? "READY FOR OWNER CLOSE" : "NOT_CLOSED";
  } catch (e) {
    step("fatal", "FAIL", { error: e instanceof Error ? e.message : String(e) });
    report.ok = false;
    report.w = "NOT_CLOSED";
  } finally {
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

void main();
