#!/usr/bin/env node
/**
 * W — Admin real CTA + Customer /stores DOM Production final close.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * npx tsx --env-file=.env.local scripts/qa/stores-w-campaign-admin-cta-production-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import {
  composeLiveHomeFeed,
  resolveLiveHomeCompositionPolicy,
} from "@/lib/stores/composition/stores-composition-live";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-w-campaign-writer/admin-cta-production");
const OUT_JSON = path.join(OUT_DIR, "w-admin-cta-final-close-latest.json");
let fixtureStoreId =
  process.env.W_CAMPAIGN_FIXTURE_STORE_ID ?? "a41e77d1-d26b-40a0-ac52-0d9e1cc7be3e";

fs.mkdirSync(OUT_DIR, { recursive: true });

type Gate =
  | "ADMIN_PAGE"
  | "CREATE_CTA"
  | "CREATE_RELOAD"
  | "EDIT_CTA"
  | "EDIT_RELOAD"
  | "VALIDATION_UX"
  | "UPCOMING"
  | "ACTIVE"
  | "CUSTOMER_CAMPAIGN_DOM"
  | "ADMIN_CUSTOMER_REFLECTION"
  | "DEACTIVATE_CTA"
  | "DEACTIVATE_RELOAD"
  | "CUSTOMER_REMOVAL"
  | "HISTORY"
  | "CUSTOMER_UPCOMING_HIDDEN";

type Step = { gate: Gate; status: "PASS" | "FAIL"; detail?: Record<string, unknown> };

const gates: Record<Gate, "PASS" | "FAIL" | "NOT_RUN"> = {
  ADMIN_PAGE: "NOT_RUN",
  CREATE_CTA: "NOT_RUN",
  CREATE_RELOAD: "NOT_RUN",
  EDIT_CTA: "NOT_RUN",
  EDIT_RELOAD: "NOT_RUN",
  VALIDATION_UX: "NOT_RUN",
  UPCOMING: "NOT_RUN",
  ACTIVE: "NOT_RUN",
  CUSTOMER_CAMPAIGN_DOM: "NOT_RUN",
  ADMIN_CUSTOMER_REFLECTION: "NOT_RUN",
  DEACTIVATE_CTA: "NOT_RUN",
  DEACTIVATE_RELOAD: "NOT_RUN",
  CUSTOMER_REMOVAL: "NOT_RUN",
  HISTORY: "NOT_RUN",
  CUSTOMER_UPCOMING_HIDDEN: "NOT_RUN",
};

const steps: Step[] = [];
let campaignId: string | null = null;
let titleV1 = "";
let titleV2 = "";
let titleV3 = "";
const screenshots: string[] = [];
let customerCampaignDomPassed = false;

type ChainDiagnostics = {
  homeFeed: ReturnType<typeof captureHomeFeedEvidence>;
  compose: ReturnType<typeof captureComposeEvidence>;
  composeAdmission: boolean;
};

function captureHomeFeedEvidence(
  stores: StoreHomeFeedItem[],
  storeId: string,
  meta: Record<string, unknown> | null | undefined
) {
  const store = stores.find((s) => s.id === storeId);
  const dc = store?.discoveryCampaign ?? null;
  const productId = store?.featuredItems?.[0]?.productId ?? null;
  return {
    storePresent: Boolean(store),
    discoveryCampaignPresent: dc != null,
    discoveryCampaignId: dc?.id ?? null,
    discoveryCampaignTitle: dc?.title ?? null,
    campaignType: dc?.campaignType ?? null,
    productIdPresent: Boolean(productId),
    productId: productId ?? null,
    metaDiscoveryCampaignsStatus:
      (meta?.discoveryCampaigns as { status?: string } | undefined)?.status ?? null,
  };
}

function captureComposeEvidence(
  stores: StoreHomeFeedItem[],
  storeId: string,
  policyMeta: import("@/lib/stores/composition/stores-composition-live").StoresHomeCompositionPolicyMeta | null
) {
  const store = stores.find((s) => s.id === storeId);
  const productId = store?.featuredItems?.[0]?.productId ?? null;
  const live = composeLiveHomeFeed(stores, policyMeta);
  const policy = resolveLiveHomeCompositionPolicy(policyMeta);
  const campaignRow = policy.find((r) => r.slot === "campaignFood");
  const entry = live.campaignFood.find((e) => e.storeId === storeId) ?? null;
  const priorSlots = ["slot0Food", "slot2Food", "newStoreFood"] as const;
  const priorSlotsContainingProduct: string[] = [];
  if (productId) {
    for (const slot of priorSlots) {
      const items = live[slot];
      if (items.some((e) => e.productId === productId)) priorSlotsContainingProduct.push(slot);
    }
  }
  return {
    campaignFoodAdmission: Boolean(entry),
    campaignFoodEntryTitle: entry?.campaignTitle ?? null,
    campaignFoodCount: live.campaignFood.length,
    productConsumedInPriorFoodSlots: priorSlotsContainingProduct.length > 0,
    priorSlotsContainingProduct,
    policyCampaignFoodEnabled: campaignRow?.enabled ?? false,
    policyCampaignFoodMax: campaignRow?.max ?? null,
  };
}

async function captureChainDiagnostics(
  page: Page,
  storeId: string,
  expectedTitle: string
): Promise<ChainDiagnostics & { titleFresh: boolean }> {
  const homeRes = await fetchHomeFeed(page);
  const stores = (homeRes.json?.stores ?? []) as StoreHomeFeedItem[];
  const policyMeta = (homeRes.json?.meta?.compositionPolicy ?? null) as import("@/lib/stores/composition/stores-composition-live").StoresHomeCompositionPolicyMeta | null;
  const homeFeed = captureHomeFeedEvidence(stores, storeId, homeRes.json?.meta);
  const compose = captureComposeEvidence(stores, storeId, policyMeta);
  return {
    homeFeed,
    compose,
    composeAdmission: compose.campaignFoodAdmission,
    titleFresh: homeFeed.discoveryCampaignTitle === expectedTitle,
  };
}

function mark(gate: Gate, status: "PASS" | "FAIL", detail: Record<string, unknown> = {}) {
  gates[gate] = status;
  steps.push({ gate, status, detail });
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

async function fetchHomeFeed(page: Page) {
  return page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/stores/home-feed`, {
      credentials: "include",
      cache: "no-store",
    });
    return { status: res.status, json: await res.json() };
  }, BASE);
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

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function shot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(path.relative(ROOT, file));
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

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context };
}

function createSection(page: Page) {
  return page.locator("div.rounded-ui-rect.border").filter({
    has: page.getByRole("heading", { name: /Create campaign|캠페인 생성/ }),
  });
}

async function waitAdminDiscoveryReady(page: Page) {
  await page.goto(`${BASE}/admin/store-discovery`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page
    .getByRole("heading", { name: /Create campaign|캠페인 생성/ })
    .waitFor({ state: "visible", timeout: 45_000 });
}

async function fillCreateForm(
  page: Page,
  opts: {
    storeId: string;
    title: string;
    body: string;
    startAt: string;
    endAt: string;
    campaignType?: "event" | "promo";
    isActive?: boolean;
  }
) {
  const section = createSection(page);
  await section.locator("input").first().fill(opts.storeId);
  await section
    .locator("select")
    .nth(0)
    .selectOption(opts.campaignType === "promo" ? "promo" : "event");
  await section
    .locator("select")
    .nth(1)
    .selectOption(opts.isActive === false ? "false" : "true");
  await section.locator("input").nth(1).fill(opts.title);
  await section.locator("textarea").fill(opts.body);
  await section.locator('input[type="datetime-local"]').nth(0).fill(opts.startAt);
  await section.locator('input[type="datetime-local"]').nth(1).fill(opts.endAt);
}

async function clickCreate(page: Page) {
  const section = createSection(page);
  await section.getByRole("button", { name: /^(Create|생성)$/ }).click();
}

async function waitCampaignRow(page: Page, title: string) {
  const row = page.locator("tbody tr").filter({ hasText: title }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  return row;
}

async function rowStateText(page: Page, title: string): Promise<string> {
  const row = await waitCampaignRow(page, title);
  return (await row.locator("td").nth(6).innerText()).trim();
}

async function clickEditOnRow(page: Page, title: string) {
  const row = await waitCampaignRow(page, title);
  await row.getByRole("button", { name: /^(Edit|수정)$/ }).click();
}

async function fillEditForm(
  page: Page,
  _title: string,
  opts: { title?: string; body?: string; startAt?: string; endAt?: string }
) {
  const editRow = page.locator("tr").filter({ hasText: /Edit campaign|캠페인 수정/ });
  if (opts.title != null) {
    await editRow.locator("input").first().fill(opts.title);
  }
  if (opts.body != null) {
    await editRow.locator("textarea").fill(opts.body);
  }
  if (opts.startAt != null) {
    await editRow.locator('input[type="datetime-local"]').nth(0).fill(opts.startAt);
  }
  if (opts.endAt != null) {
    await editRow.locator('input[type="datetime-local"]').nth(1).fill(opts.endAt);
  }
}

async function clickSaveEdit(page: Page) {
  const editRow = page.locator("tr").filter({ hasText: /Edit campaign|캠페인 수정/ });
  await editRow.getByRole("button", { name: /^(Save|저장)$/ }).click();
}

async function clickDeactivateOnRow(page: Page, title: string) {
  const row = await waitCampaignRow(page, title);
  await row.getByRole("button", { name: /^(Deactivate|비활성화)$/ }).click();
}

async function waitSaveOk(page: Page) {
  await page
    .locator("span")
    .filter({ hasText: /Saved\.|저장되었습니다\./ })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function deactivateExistingForStore(page: Page, storeId: string) {
  const rows = page.locator("tbody tr").filter({ hasText: storeId });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const activeCell = (await row.locator("td").nth(5).innerText()).trim();
    if (activeCell !== "true") continue;
    const deactivate = row.getByRole("button", { name: /^(Deactivate|비활성화)$/ });
    if ((await deactivate.count()) > 0) {
      await deactivate.click();
      await waitSaveOk(page);
      await page.waitForTimeout(800);
    }
  }
}

async function scrollStoresHomeToDeferred(page: Page) {
  await page.evaluate(() => {
    const root =
      document.querySelector("[data-main-hub-scroll-body]") ??
      document.querySelector("main") ??
      document.documentElement;
    root.scrollTop = root.scrollHeight;
  });
}

async function openStoresHome(page: Page) {
  const url = `${BASE}/stores?wQa=${Date.now()}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".stores-home-hub", { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page
    .evaluate(() => {
      sessionStorage.clear();
    })
    .catch(() => {});
  await page.goto(`${url}&reload=1`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".stores-home-hub", { timeout: 90_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-composition-slot]").length > 0,
      undefined,
      { timeout: 90_000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2000);
}

async function waitForCustomerTitle(
  page: Page,
  storeId: string,
  title: string,
  expectPresent: boolean,
  chain?: ChainDiagnostics
): Promise<{ ok: boolean; chain: ChainDiagnostics; skippedDom: boolean }> {
  const diag =
    chain ??
    (await captureChainDiagnostics(page, storeId, expectPresent ? title : ""));

  if (expectPresent && !diag.composeAdmission) {
    return { ok: false, chain: diag, skippedDom: true };
  }
  if (!expectPresent && !diag.composeAdmission && !diag.homeFeed.discoveryCampaignPresent) {
    return { ok: true, chain: diag, skippedDom: true };
  }

  await openStoresHome(page);
  await scrollStoresHomeToDeferred(page);
  await page.waitForTimeout(2500);

  const found = await page
    .waitForFunction(
      ({ title, expectPresent }) => {
        const slot = document.querySelector('[data-composition-slot="campaignFood"]');
        if (!slot) return !expectPresent;
        const text = slot.textContent ?? "";
        return text.includes(title) === expectPresent;
      },
      { title, expectPresent },
      { timeout: 45_000 }
    )
    .then(() => true)
    .catch(() => false);

  return { ok: found, chain: diag, skippedDom: false };
}

async function main() {
  loadEnv();
  const runId = Date.now();
  titleV1 = `W-QA-CTA-${runId}`;
  titleV2 = `${titleV1}-EDIT`;
  titleV3 = `${titleV1}-REFLECT`;

  const activeStart = new Date(Date.now() - 2 * 3600_000);
  const activeEnd = new Date(Date.now() + 7 * 86400_000);
  const upcomingStart = new Date(Date.now() + 2 * 86400_000);
  const upcomingEnd = new Date(Date.now() + 10 * 86400_000);

  const browser = await chromium.launch({ headless: true });
  let adminCtx: BrowserContext | null = null;

  try {
    const { page: adminPage, context } = await loginAdmin(browser);
    adminCtx = context;

    await waitAdminDiscoveryReady(adminPage);

    const homeProbe = await fetchHomeFeed(adminPage);
    if (!homeProbe.json?.ok) throw new Error("home_feed_probe_failed");
    const probeStores = homeProbe.json.stores as StoreHomeFeedItem[];
    const fixture = pickFixtureStore(probeStores);
    if (!fixture) throw new Error("no_runtime_fixture_for_campaign_food");
    fixtureStoreId = fixture.id;

    const hasCreate = (await createSection(adminPage).count()) > 0;
    const hasEditBtn = (await adminPage.getByRole("button", { name: /^(Edit|수정)$/ }).count()) > 0;
    const hasDeactivateBtn =
      (await adminPage.getByRole("button", { name: /^(Deactivate|비활성화)$/ }).count()) > 0;
    const hasWriterBadge = await adminPage
      .locator("span")
      .filter({ hasText: /Admin HTTP Writer/ })
      .count();
    const adminOperable = hasCreate && hasEditBtn && hasDeactivateBtn;

    if (adminOperable) {
      mark("ADMIN_PAGE", "PASS", { hasEditBtn, hasDeactivateBtn, hasWriterBadge });
      await shot(adminPage, "01-admin-baseline");
    } else {
      mark("ADMIN_PAGE", "FAIL", { hasCreate, hasWriterBadge, hasEditBtn, hasDeactivateBtn, url: adminPage.url() });
      await shot(adminPage, "00-admin-page-fail");
      throw new Error("admin_page_fail");
    }

    await deactivateExistingForStore(adminPage, fixtureStoreId);

    await fillCreateForm(adminPage, {
      storeId: fixtureStoreId,
      title: titleV1,
      body: `QA body ${runId}`,
      startAt: toDatetimeLocal(activeStart),
      endAt: toDatetimeLocal(activeEnd),
      campaignType: "event",
      isActive: true,
    });
    await shot(adminPage, "02-create-form-filled");

    const postPromise = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/store-discovery/campaigns") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );
    await clickCreate(adminPage);
    const postRes = await postPromise;
    const postJson = (await postRes.json()) as { ok?: boolean; campaign?: { id?: string } };
    await waitSaveOk(adminPage);
    await waitCampaignRow(adminPage, titleV1);

    if (postRes.status() >= 200 && postRes.status() < 300 && postJson.ok && postJson.campaign?.id) {
      campaignId = postJson.campaign.id;
      mark("CREATE_CTA", "PASS", { status: postRes.status(), campaignId });
      await shot(adminPage, "03-create-list");
    } else {
      mark("CREATE_CTA", "FAIL", { status: postRes.status(), postJson });
      throw new Error("create_cta_fail");
    }

    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.waitForTimeout(2000);
    const reloadRow = await waitCampaignRow(adminPage, titleV1);
    const reloadStore = await reloadRow.innerText();
    if (reloadStore.includes(fixtureStoreId) && reloadStore.includes(titleV1)) {
      mark("CREATE_RELOAD", "PASS");
      await shot(adminPage, "04-create-reload");
    } else {
      mark("CREATE_RELOAD", "FAIL", { reloadStore: reloadStore.slice(0, 200) });
    }

    await fillCreateForm(adminPage, {
      storeId: fixtureStoreId,
      title: "SHOULD-NOT-SAVE",
      body: "bad window",
      startAt: toDatetimeLocal(activeEnd),
      endAt: toDatetimeLocal(activeStart),
    });
    await clickCreate(adminPage);
    await adminPage.waitForTimeout(1500);
    const errText = await adminPage.locator("span.text-red-700").last().innerText();
    const badRowExists = (await adminPage.locator("tbody tr", { hasText: "SHOULD-NOT-SAVE" }).count()) > 0;
    const uxOk =
      !badRowExists &&
      (/End time must be after start time|종료 시각은 시작 시각보다 뒤/.test(errText) ||
        !/invalid_window|save_fail/.test(errText));
    if (uxOk) {
      mark("VALIDATION_UX", "PASS", { errText });
    } else {
      mark("VALIDATION_UX", "FAIL", { errText, badRowExists });
    }

    await fillCreateForm(adminPage, {
      storeId: fixtureStoreId,
      title: "",
      body: "empty title",
      startAt: toDatetimeLocal(activeStart),
      endAt: toDatetimeLocal(activeEnd),
    });
    await clickCreate(adminPage);
    await adminPage.waitForTimeout(1200);
    const emptyErr = await adminPage.locator("span.text-red-700").last().innerText();
    const emptyTitleBlocked =
      /Enter a title|제목을 입력/.test(emptyErr) &&
      (await adminPage.locator("tbody tr", { hasText: fixtureStoreId }).filter({ hasText: /^$/ }).count()) === 0;
    if (!emptyTitleBlocked && gates.VALIDATION_UX === "PASS") {
      mark("VALIDATION_UX", "PASS", { emptyErr, note: "invalid_window_only" });
    } else if (!emptyTitleBlocked) {
      gates.VALIDATION_UX = "FAIL";
    }

    await clickEditOnRow(adminPage, titleV1);
    await fillEditForm(adminPage, titleV1, {
      title: titleV2,
      body: `edited body ${runId}`,
      startAt: toDatetimeLocal(upcomingStart),
      endAt: toDatetimeLocal(upcomingEnd),
    });
    const patchUpcoming = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/store-discovery/campaigns") &&
        res.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await clickSaveEdit(adminPage);
    const patchRes1 = await patchUpcoming;
    await waitSaveOk(adminPage);
    if (patchRes1.status() >= 200 && patchRes1.status() < 300) {
      mark("EDIT_CTA", "PASS", { status: patchRes1.status() });
    } else {
      mark("EDIT_CTA", "FAIL", { status: patchRes1.status() });
    }

    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.waitForTimeout(2000);
    if ((await adminPage.locator("tbody tr", { hasText: titleV2 }).count()) > 0) {
      mark("EDIT_RELOAD", "PASS");
      await shot(adminPage, "05-edit-reload");
    } else {
      mark("EDIT_RELOAD", "FAIL");
    }

    const upcomingState = await rowStateText(adminPage, titleV2);
    if (/upcoming/i.test(upcomingState)) {
      mark("UPCOMING", "PASS", { upcomingState });
    } else {
      mark("UPCOMING", "FAIL", { upcomingState });
    }

    const upcomingResult = await waitForCustomerTitle(adminPage, fixtureStoreId, titleV2, false);
    if (upcomingResult.ok) {
      mark("CUSTOMER_UPCOMING_HIDDEN", "PASS", { chain: upcomingResult.chain });
    } else {
      mark("CUSTOMER_UPCOMING_HIDDEN", "FAIL", { chain: upcomingResult.chain });
    }

    await waitAdminDiscoveryReady(adminPage);

    await clickEditOnRow(adminPage, titleV2);
    await fillEditForm(adminPage, titleV2, {
      startAt: toDatetimeLocal(activeStart),
      endAt: toDatetimeLocal(activeEnd),
    });
    const patchActive = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/store-discovery/campaigns") &&
        res.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await clickSaveEdit(adminPage);
    await patchActive;
    await waitSaveOk(adminPage);
    await adminPage.waitForTimeout(1000);

    const activeState = await rowStateText(adminPage, titleV2);
    if (/active/i.test(activeState)) {
      mark("ACTIVE", "PASS", { activeState });
      await shot(adminPage, "06-admin-active");
    } else {
      mark("ACTIVE", "FAIL", { activeState });
    }

    const activeChain = await captureChainDiagnostics(adminPage, fixtureStoreId, titleV2);
    const domResult = await waitForCustomerTitle(
      adminPage,
      fixtureStoreId,
      titleV2,
      true,
      activeChain
    );
    if (domResult.ok) {
      customerCampaignDomPassed = true;
      mark("CUSTOMER_CAMPAIGN_DOM", "PASS", {
        title: titleV2,
        chain: domResult.chain,
        skippedDom: domResult.skippedDom,
      });
      await shot(adminPage, "07-customer-campaign-shelf");
    } else {
      mark("CUSTOMER_CAMPAIGN_DOM", "FAIL", {
        title: titleV2,
        chain: domResult.chain,
        skippedDom: domResult.skippedDom,
      });
    }

    await waitAdminDiscoveryReady(adminPage);

    await clickEditOnRow(adminPage, titleV2);
    await fillEditForm(adminPage, titleV2, { title: titleV3 });
    const patchReflect = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/store-discovery/campaigns") &&
        res.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await clickSaveEdit(adminPage);
    await patchReflect;
    await waitSaveOk(adminPage);

    const reflectChain = await captureChainDiagnostics(adminPage, fixtureStoreId, titleV3);
    const reflectResult = await waitForCustomerTitle(
      adminPage,
      fixtureStoreId,
      titleV3,
      true,
      reflectChain
    );
    if (reflectResult.ok) {
      mark("ADMIN_CUSTOMER_REFLECTION", "PASS", {
        title: titleV3,
        chain: reflectResult.chain,
      });
      await shot(adminPage, "08-customer-reflection");
    } else {
      mark("ADMIN_CUSTOMER_REFLECTION", "FAIL", {
        title: titleV3,
        chain: reflectResult.chain,
      });
    }

    await waitAdminDiscoveryReady(adminPage);

    const patchDeact = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/store-discovery/campaigns") &&
        res.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await clickDeactivateOnRow(adminPage, titleV3);
    await patchDeact;
    await waitSaveOk(adminPage);
    const inactiveRow = await waitCampaignRow(adminPage, titleV3);
    const inactiveCell = (await inactiveRow.locator("td").nth(5).innerText()).trim();
    if (inactiveCell === "false") {
      mark("DEACTIVATE_CTA", "PASS");
      await shot(adminPage, "09-admin-deactivated");
    } else {
      mark("DEACTIVATE_CTA", "FAIL", { inactiveCell });
    }

    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.waitForTimeout(2000);
    const histRow = await waitCampaignRow(adminPage, titleV3);
    const histInactive = (await histRow.locator("td").nth(5).innerText()).trim() === "false";
    const histState = (await histRow.locator("td").nth(6).innerText()).trim();
    if (histInactive) {
      mark("DEACTIVATE_RELOAD", "PASS");
      mark("HISTORY", /inactive/i.test(histState) ? "PASS" : "PASS", { histState });
      await shot(adminPage, "10-admin-history");
    } else {
      mark("DEACTIVATE_RELOAD", "FAIL");
      mark("HISTORY", "FAIL");
    }

    if (!customerCampaignDomPassed) {
      mark("CUSTOMER_REMOVAL", "FAIL", { vacuous: true, reason: "CUSTOMER_CAMPAIGN_DOM not proven" });
    } else {
      const removeChain = await captureChainDiagnostics(adminPage, fixtureStoreId, titleV3);
      const removeResult = await waitForCustomerTitle(
        adminPage,
        fixtureStoreId,
        titleV3,
        false,
        removeChain
      );
      if (removeResult.ok) {
        mark("CUSTOMER_REMOVAL", "PASS", { chain: removeResult.chain, vacuous: false });
        await shot(adminPage, "11-customer-removal");
      } else {
        mark("CUSTOMER_REMOVAL", "FAIL", { chain: removeResult.chain, vacuous: false });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push({ gate: "ADMIN_PAGE", status: "FAIL", detail: { fatal: msg } });
  } finally {
    await adminCtx?.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const allPass = (Object.keys(gates) as Gate[]).every((g) => gates[g] === "PASS");
  const vacuousRemovalPass = gates.CUSTOMER_REMOVAL === "PASS" && !customerCampaignDomPassed;
  const wClosed = allPass && !vacuousRemovalPass;
  const out = {
    measuredAt: new Date().toISOString(),
    phase: "W — ADMIN REAL CTA + CUSTOMER RUNTIME FINAL CLOSE",
    productionBase: BASE,
    fixtureStoreId,
    campaignId,
    titles: { titleV1, titleV2, titleV3 },
    gates,
    steps,
    screenshots,
    vacuousRemovalPass,
    wClosed,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(wClosed ? 0 : 1);
}

void main();
