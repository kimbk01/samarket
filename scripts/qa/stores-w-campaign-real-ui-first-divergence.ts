#!/usr/bin/env node
/**
 * W — Actual /stores browser render path first divergence (ONE load, ONE scroll).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * npx tsx --env-file=.env.local scripts/qa/stores-w-campaign-real-ui-first-divergence.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import {
  composeLiveHomeFeed,
  resolveLiveHomeCompositionPolicy,
  type StoresHomeCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-live";
import {
  resolveOrderedVisibleHomeCompositionSlots,
  splitHomeCompositionSlotsForRender,
} from "@/lib/stores/composition/stores-composition-home-section-order";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-w-campaign-writer/admin-cta-production");
const OUT_JSON = path.join(OUT_DIR, "w-real-ui-first-divergence-latest.json");
const FIXTURE_STORE_ID =
  process.env.W_CAMPAIGN_FIXTURE_STORE_ID ?? "a41e77d1-d26b-40a0-ac52-0d9e1cc7be3e";

fs.mkdirSync(OUT_DIR, { recursive: true });

type PassFail = "PASS" | "FAIL" | "NOT_RUN";

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

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(cookies);
  return { page: await context.newPage(), context };
}

async function adminToActiveCampaign(page: Page, titleActive: string) {
  const runId = Date.now();
  const titleV1 = `W-UI-${runId}`;
  const activeStart = new Date(Date.now() - 2 * 3600_000);
  const activeEnd = new Date(Date.now() + 7 * 86400_000);

  await page.goto(`${BASE}/admin/store-discovery`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const rows = page.locator("tbody tr").filter({ hasText: FIXTURE_STORE_ID });
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    if ((await row.locator("td").nth(5).innerText()).trim() !== "true") continue;
    const btn = row.getByRole("button", { name: /^(Deactivate|비활성화)$/ });
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.locator("span").filter({ hasText: /Saved\.|저장되었습니다\./ }).first().waitFor({ timeout: 30_000 });
    }
  }

  const section = page.locator("div.rounded-ui-rect.border").filter({
    has: page.getByRole("heading", { name: /Create campaign|캠페인 생성/ }),
  });
  await section.locator("input").first().fill(FIXTURE_STORE_ID);
  await section.locator("select").nth(0).selectOption("event");
  await section.locator("select").nth(1).selectOption("true");
  await section.locator("input").nth(1).fill(titleV1);
  await section.locator("textarea").fill(`ui proof ${runId}`);
  await section.locator('input[type="datetime-local"]').nth(0).fill(toDatetimeLocal(activeStart));
  await section.locator('input[type="datetime-local"]').nth(1).fill(toDatetimeLocal(activeEnd));
  await section.getByRole("button", { name: /^(Create|생성)$/ }).click();
  await page.locator("span").filter({ hasText: /Saved\.|저장되었습니다\./ }).first().waitFor({ timeout: 30_000 });

  const editRow = page.locator("tbody tr").filter({ hasText: titleV1 }).first();
  await editRow.getByRole("button", { name: /^(Edit|수정)$/ }).click();
  const editForm = page.locator("tr").filter({ hasText: /Edit campaign|캠페인 수정/ });
  await editForm.locator("input").first().fill(titleActive);
  await editForm.getByRole("button", { name: /^(Save|저장)$/ }).click();
  await page.locator("span").filter({ hasText: /Saved\.|저장되었습니다\./ }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  return titleActive;
}

type HomeFeedJson = {
  ok?: boolean;
  stores?: StoreHomeFeedItem[];
  meta?: { compositionPolicy?: unknown };
};

function computeClientCompositionFromFeed(
  feed: HomeFeedJson | null,
  expectedTitle: string,
  fixtureStoreId: string
) {
  if (!feed?.ok || !Array.isArray(feed.stores)) {
    return {
      hubStorePresent: false,
      hubCampaignTitleMatch: false,
      campaignFoodEntryCount: 0,
      campaignFoodHasExpectedTitle: false,
      orderedSlots: [] as string[],
      deferredSlots: [] as string[],
      campaignFoodInOrdered: false,
      campaignFoodInDeferred: false,
    };
  }
  const qa = feed.stores.find((s) => s.id === fixtureStoreId);
  const policyMeta = (feed.meta?.compositionPolicy ?? null) as StoresHomeCompositionPolicyMeta | null;
  const policy = resolveLiveHomeCompositionPolicy(policyMeta);
  const composition = composeLiveHomeFeed(feed.stores, policyMeta);
  const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition);
  const split = splitHomeCompositionSlotsForRender(ordered);
  const campaignEntries = composition.campaignFood ?? [];
  const titleMatch = campaignEntries.some((e) => e.campaignTitle === expectedTitle);
  return {
    hubStorePresent: !!qa,
    hubCampaignTitleMatch: qa?.discoveryCampaign?.title === expectedTitle,
    campaignFoodEntryCount: campaignEntries.length,
    campaignFoodHasExpectedTitle: titleMatch,
    orderedSlots: ordered,
    deferredSlots: split.deferredSlots,
    campaignFoodInOrdered: ordered.includes("campaignFood"),
    campaignFoodInDeferred: split.deferredSlots.includes("campaignFood"),
  };
}

async function observeStoresPage(
  page: Page,
  expectedTitle: string,
  homeFeedFromNetwork: unknown,
  fixtureStoreId: string
) {
  return page.evaluate(
    ({ expectedTitle, homeFeedFromNetwork, fixtureStoreId }) => {
      const sessionFeeds: Array<{
        key: string;
        storeCount: number;
        qaStore: {
          id: string;
          discoveryCampaign: {
            id: string;
            title: string;
            campaignType: string;
            startAt: string;
            endAt: string;
          } | null;
          featuredProductId: string | null;
        } | null;
      }> = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith("samarket:stores-home-feed:v1:")) continue;
        try {
          const raw = sessionStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { stores?: Array<Record<string, unknown>> };
          const stores = parsed.stores ?? [];
          const qa = stores.find((s) => s.id === fixtureStoreId);
          sessionFeeds.push({
            key,
            storeCount: stores.length,
            qaStore: qa
              ? {
                  id: String(qa.id),
                  discoveryCampaign:
                    (qa.discoveryCampaign as {
                      id: string;
                      title: string;
                      campaignType: string;
                      startAt: string;
                      endAt: string;
                    } | null) ?? null,
                  featuredProductId:
                    ((qa.featuredItems as Array<{ productId?: string }> | undefined)?.[0]
                      ?.productId as string) ?? null,
                }
              : null,
          });
        } catch {
          /* skip */
        }
      }

      const networkJson = homeFeedFromNetwork as {
        ok?: boolean;
        stores?: Array<Record<string, unknown>>;
      } | null;
      const networkStores = networkJson?.stores ?? [];
      const networkQa = networkStores.find((s) => s.id === fixtureStoreId);
      const networkQaSlice = networkQa
        ? {
            id: String(networkQa.id),
            discoveryCampaign:
              (networkQa.discoveryCampaign as {
                id: string;
                title: string;
                campaignType: string;
                startAt: string;
                endAt: string;
              } | null) ?? null,
            featuredProductId:
              ((networkQa.featuredItems as Array<{ productId?: string }> | undefined)?.[0]
                ?.productId as string) ?? null,
          }
        : null;

      const hubReady = document.querySelector('[data-stores-home-feed-ready="1"]') != null;
      const pendingBlank = document.querySelector('[data-stores-home-feed-pending-blank="true"]') != null;

      const slots = [...document.querySelectorAll("[data-composition-slot]")].map(
        (el) => el.getAttribute("data-composition-slot") ?? ""
      );

      const deferredHost = document.querySelector(".stores-home-hub div.min-h-\\[8rem\\]");
      const deferredHostChildCount = deferredHost?.childElementCount ?? 0;
      const deferredHostHasMinH = deferredHost != null;

      const campaignSlot = document.querySelector('[data-composition-slot="campaignFood"]');
      const campaignSlotText = campaignSlot?.textContent ?? "";
      const titleInCampaignSlot = campaignSlotText.includes(expectedTitle);
      const titleAnywhere = (document.body.textContent ?? "").includes(expectedTitle);

      const foodCards = [...document.querySelectorAll("[data-stores-home-food-rail-card]")].map((el) => ({
        text: (el.textContent ?? "").slice(0, 200),
        hasTitle: (el.textContent ?? "").includes(expectedTitle),
      }));

      return {
        hubReady,
        pendingBlank,
        networkQa: networkQaSlice,
        sessionFeeds,
        slots,
        deferredHostHasMinH,
        deferredHostChildCount,
        campaignSlotExists: campaignSlot != null,
        titleInCampaignSlot,
        titleAnywhere,
        foodCardsWithTitle: foodCards.filter((c) => c.hasTitle).length,
        foodCardCount: foodCards.length,
      };
    },
    { expectedTitle, homeFeedFromNetwork, fixtureStoreId }
  );
}

async function main() {
  loadEnv();
  const titleActive = `W-UI-PROOF-${Date.now()}-EDIT`;
  const browser = await chromium.launch({ headless: true });
  let ctx: Awaited<ReturnType<typeof loginAdmin>>["context"] | null = null;

  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    phase: "W — REAL UI FIRST DIVERGENCE",
    productionBase: BASE,
    fixtureStoreId: FIXTURE_STORE_ID,
    titleActive,
    gates: {} as Record<string, PassFail>,
    firstDivergence: "NOT_YET_PROVEN",
    rootCause: "NOT_YET_PROVEN",
    rootCauseClass: "NOT_YET_PROVEN",
    fix: "NONE",
  };

  try {
    const { page, context } = await loginAdmin(browser);
    ctx = context;

    await adminToActiveCampaign(page, titleActive);

    const homeFeedResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/stores/home-feed") && res.request().method() === "GET",
      { timeout: 60_000 }
    );

    await page.goto(`${BASE}/stores?wUiProof=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const homeFeedResponse = await homeFeedResponsePromise;
    const homeFeedNetwork = (await homeFeedResponse.json()) as HomeFeedJson;

    await page.waitForSelector(".stores-home-hub", { timeout: 60_000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-stores-home-feed-ready="1"]') != null ||
        document.querySelectorAll("[data-composition-slot]").length > 0,
      undefined,
      { timeout: 60_000 }
    );
    await page.waitForTimeout(1500);

    const beforeScroll = await observeStoresPage(page, titleActive, homeFeedNetwork, FIXTURE_STORE_ID);

    await page.evaluate(() => {
      const root =
        document.querySelector("[data-main-hub-scroll-body]") ??
        document.querySelector("main") ??
        document.documentElement;
      root.scrollTop = root.scrollHeight;
    });
    await page.waitForTimeout(3000);

    const afterScroll = await observeStoresPage(page, titleActive, homeFeedNetwork, FIXTURE_STORE_ID);

    const networkCompose = computeClientCompositionFromFeed(
      homeFeedNetwork,
      titleActive,
      FIXTURE_STORE_ID
    );

    const sessionFeedRaw = beforeScroll.sessionFeeds?.[0];
    let sessionCompose = computeClientCompositionFromFeed(null, titleActive, FIXTURE_STORE_ID);
    if (sessionFeedRaw?.key) {
      const sessionJson = await page.evaluate((key) => {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }, sessionFeedRaw.key as string);
      sessionCompose = computeClientCompositionFromFeed(
        sessionJson as HomeFeedJson,
        titleActive,
        FIXTURE_STORE_ID
      );
    }

    const g = report.gates as Record<string, PassFail>;

    const sessionHasCampaign =
      sessionFeedRaw?.qaStore?.discoveryCampaign?.title === titleActive;
    const networkHasCampaign = networkCompose.hubCampaignTitleMatch;

    g.actualHubStore =
      sessionCompose.hubStorePresent || networkCompose.hubStorePresent ? "PASS" : "FAIL";
    g.actualHubCampaign =
      sessionHasCampaign || networkHasCampaign ? "PASS" : "FAIL";
    g.actualClientCampaignFood =
      networkCompose.campaignFoodHasExpectedTitle ? "PASS" : "FAIL";
    g.orderedSlotCampaignFood = networkCompose.campaignFoodInOrdered ? "PASS" : "FAIL";
    g.deferredSlotCampaignFood = networkCompose.campaignFoodInDeferred ? "PASS" : "FAIL";

    const slotsAfter = afterScroll.slots as string[];
    g.deferredViewportMount =
      afterScroll.deferredHostChildCount > 0 || slotsAfter.length > (beforeScroll.slots as string[]).length
        ? "PASS"
        : "FAIL";
    g.campaignDom = afterScroll.campaignSlotExists ? "PASS" : "FAIL";
    g.campaignTitle = afterScroll.titleInCampaignSlot ? "PASS" : "FAIL";

    report.beforeScroll = beforeScroll;
    report.afterScroll = afterScroll;
    report.browserNetworkCompose = networkCompose;
    report.browserSessionCompose = sessionCompose;
    report.sessionVsNetworkCampaign = {
      sessionHasCampaign,
      networkHasCampaign,
      sessionCampaignTitle: sessionFeedRaw?.qaStore?.discoveryCampaign?.title ?? null,
      networkCampaignTitle: beforeScroll.networkQa?.discoveryCampaign?.title ?? null,
    };

    if (g.actualHubStore === "FAIL") {
      report.firstDivergence = "CLIENT FEED/CACHE DIVERGENCE — QA store missing from browser feed inputs";
      report.rootCauseClass = "PRODUCT";
    } else if (g.actualHubCampaign === "FAIL") {
      report.firstDivergence =
        "CLIENT FEED/CACHE DIVERGENCE — discoveryCampaign missing/stale in browser feed inputs";
      report.rootCauseClass = "PRODUCT";
    } else if (networkHasCampaign && !sessionHasCampaign && sessionFeedRaw) {
      report.firstDivergence =
        "CLIENT FEED/CACHE DIVERGENCE — network has campaign; session cache stale";
      report.rootCauseClass = "PRODUCT";
    } else if (g.actualClientCampaignFood === "FAIL") {
      report.firstDivergence =
        "CLIENT COMPOSITION DIVERGENCE — browser-received feed does not produce campaignFood entry";
      report.rootCauseClass = "PRODUCT";
    } else if (g.orderedSlotCampaignFood === "FAIL") {
      report.firstDivergence = "SECTION VISIBILITY/ORDER BUG — campaignFood missing from ordered slots";
      report.rootCauseClass = "PRODUCT";
    } else if (g.deferredSlotCampaignFood === "FAIL") {
      report.firstDivergence = "SECTION VISIBILITY/ORDER BUG — campaignFood not in deferred bundle";
      report.rootCauseClass = "PRODUCT";
    } else if (g.deferredViewportMount === "FAIL" && beforeScroll.deferredHostHasMinH) {
      report.firstDivergence = "StoresHomeDeferredViewport — deferred children not mounted after scroll";
      report.rootCauseClass = "PRODUCT";
    } else if (g.campaignDom === "FAIL") {
      report.firstDivergence = "StoresHomeCompositionSlotSection — campaignFood slot not rendered in DOM";
      report.rootCauseClass = "PRODUCT";
    } else if (g.campaignDom === "PASS" && g.campaignTitle === "FAIL") {
      report.firstDivergence = "StoresHomeFoodRailCard — campaignFood slot exists but title text missing";
      report.rootCauseClass = "PRODUCT";
    } else if (g.campaignDom === "PASS" && g.campaignTitle === "PASS") {
      report.firstDivergence = "NONE";
      report.rootCauseClass = "NONE";
    } else {
      report.firstDivergence = "NOT_YET_PROVEN";
      report.rootCauseClass = "NOT_YET_PROVEN";
    }

    if (report.rootCauseClass === "PRODUCT" && report.firstDivergence !== "NOT_YET_PROVEN") {
      report.rootCause = String(report.firstDivergence);
    } else if (report.firstDivergence === "NONE") {
      report.rootCause = "NONE";
    } else {
      report.rootCause = "NOT_YET_PROVEN";
    }

    await page.screenshot({
      path: path.join(OUT_DIR, "w-real-ui-after-scroll.png"),
      fullPage: true,
    });
  } catch (e) {
    report.fatal = e instanceof Error ? e.message : String(e);
    report.firstDivergence = "NOT_YET_PROVEN";
    report.rootCause = "NOT_YET_PROVEN";
  } finally {
    await ctx?.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main();
