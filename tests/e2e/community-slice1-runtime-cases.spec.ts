/**
 * COMMUNITY SLICE 1 — Live Runtime CASE 1–8
 *
 * DEAD_PROVEN / REWORK_REQUIRED (2026-08-10):
 * Expects old 2-row IA (동네|인기 → 전체|Topic + region-gated Home).
 * Product IA is one-row: Home▼ | Admin Topics | Local | Popular.
 * Replacement harness: `tests/e2e/community-ia-runtime-cases.spec.ts`.
 * Do not delete this file in Legacy cleanup until callers=0 is re-audited;
 * suite is skipped so CLOSED is not blocked by stale 2-row expectations.
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3020 \
 *   npx playwright test tests/e2e/community-slice1-runtime-cases.spec.ts --workers=1
 */
import { test, expect, type Page, type Response } from "@playwright/test";
import {
  assertPlaywrightOriginReachable,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

async function ensureSlice1Session(page: import("@playwright/test").Page, origin: string): Promise<void> {
  try {
    const { ensureE2eUserSession } = await import("./helpers/playwright-origin-and-session");
    await ensureE2eUserSession(page);
    return;
  } catch (e) {
    console.log("[SLICE1] ensureE2eUserSession failed, trying UI login fallback", String(e).slice(0, 200));
  }
  const user = (process.env.E2E_TEST_USERNAME ?? "aaaa").trim();
  const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
  const ids = user.includes("@")
    ? [user]
    : [`${user}@manual.local`, `${user}@samarket.local`, user];
  for (const id of ids) {
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    const ops = page.getByRole("button", { name: /Internal \/ operations|내부|운영/i }).first();
    if (await ops.isVisible().catch(() => false)) {
      await ops.click();
      await page.waitForTimeout(400);
    }
    const submit = page.getByRole("button", { name: /Sign in|로그인/i }).first();
    const idInput = page.locator('form input[type="text"], form input:not([type="password"]):not([type="hidden"])').first();
    const passInput = page.locator('form input[type="password"]').first();
    if (!(await submit.isVisible().catch(() => false))) continue;
    if (!(await idInput.isVisible().catch(() => false))) continue;
    await idInput.fill(id);
    await passInput.fill(pass);
    await submit.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
    const probe = await page.request.get(`${origin}/api/me/settings`);
    if (probe.ok()) return;
  }
  throw new Error(`[SLICE1] login failed — set E2E_TEST_USERNAME/PASSWORD or refresh tests/e2e/.auth/cm-storage.json`);
}

type FeedHit = {
  url: string;
  status: number;
  globalFeed: boolean;
  locationKey: string | null;
  category: string | null;
  sort: string | null;
  postCount: number | null;
};

function parseFeedUrl(u: string): Omit<FeedHit, "status" | "postCount"> {
  const url = new URL(u, "http://local.invalid");
  return {
    url: u,
    globalFeed: url.searchParams.get("globalFeed") === "1",
    locationKey: url.searchParams.get("locationKey"),
    category: url.searchParams.get("category"),
    sort: url.searchParams.get("sort"),
  };
}

async function waitNeighborhoodFeed(
  page: Page,
  predicate?: (hit: FeedHit) => boolean,
  timeoutMs = 25_000
): Promise<FeedHit> {
  const res = await page.waitForResponse(
    async (r: Response) => {
      if (!r.url().includes("/api/philife/neighborhood-feed") && !r.url().includes("/api/community/neighborhood-feed")) {
        return false;
      }
      if (r.request().method() !== "GET") return false;
      let postCount: number | null = null;
      try {
        const j = (await r.json()) as { posts?: unknown[] };
        postCount = Array.isArray(j.posts) ? j.posts.length : null;
      } catch {
        /* ignore body */
      }
      const hit: FeedHit = { ...parseFeedUrl(r.url()), status: r.status(), postCount };
      return predicate ? predicate(hit) : true;
    },
    { timeout: timeoutMs }
  );
  let postCount: number | null = null;
  try {
    const j = (await res.json()) as { posts?: unknown[] };
    postCount = Array.isArray(j.posts) ? j.posts.length : null;
  } catch {
    /* ignore */
  }
  return { ...parseFeedUrl(res.url()), status: res.status(), postCount };
}

async function openCommunityHub(page: Page, origin: string): Promise<FeedHit> {
  const feedP = waitNeighborhoodFeed(page);
  await page.goto(`${origin}/philife`, { waitUntil: "domcontentloaded" });
  return feedP;
}

test.describe.configure({ mode: "serial" });

test.skip(
  "COMMUNITY SLICE 1 CASE 1–8 runtime — DEAD_PROVEN old 2-row IA; use community-ia-runtime-cases",
  async ({ page, request }) => {
  test.setTimeout(180_000);
  const origin = playwrightOriginFromEnv();
  await assertPlaywrightOriginReachable(request);
  await ensureSlice1Session(page, origin);

  // ── CASE 1: default entry = region + local + all ──
  const case1Feed = await openCommunityHub(page, origin);
  const url1 = page.url();
  const modeLocal = page.getByRole("tab", { name: /동네|Local/i }).first();
  const modePopular = page.getByRole("tab", { name: /인기|Popular/i }).first();
  await expect(modeLocal).toBeVisible({ timeout: 20_000 });
  await expect(modePopular).toBeVisible();

  const case1Fail =
    case1Feed.globalFeed === true
      ? "globalFeed=1 on default Community feed"
      : !case1Feed.locationKey
        ? "missing locationKey on default Community feed"
        : case1Feed.category
          ? `first-topic force category=${case1Feed.category}`
          : case1Feed.sort === "popular"
            ? "default mode is popular, expected local/latest"
            : null;

  if (case1Fail) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_1",
          EXPECTED: "region + local + all (no globalFeed, no category)",
          ACTUAL: { url: url1, feed: case1Feed },
          AUTHORITY: "CommunityFeed region fetch + boot all",
          FILE: "components/community/CommunityFeed.tsx",
          CAUSE: case1Fail,
        },
        null,
        2
      )
    );
    expect(case1Fail, `CASE 1 FAIL: ${case1Fail}`).toBeNull();
  }
  console.log("CASE_1_PASS", { url: url1, feed: case1Feed });

  // Topic chips: find a real topic tab (not 전체/Local/Popular)
  const topicTabs = page.locator('[role="tablist"]').filter({ has: page.getByRole("tab", { name: /동네|Local/i }) });
  // Topic strip is separate from mode strip — find tabs whose slug is not empty via URL after click
  const allChipCandidates = page.locator('[role="tab"]');
  const tabCount = await allChipCandidates.count();
  let topicALabel: string | null = null;
  let topicBLabel: string | null = null;
  for (let i = 0; i < tabCount; i += 1) {
    const t = allChipCandidates.nth(i);
    const label = ((await t.innerText()) || "").trim();
    if (!label) continue;
    if (/^(동네|인기|Local|Popular|전체|All)$/i.test(label)) continue;
    if (!topicALabel) topicALabel = label;
    else if (!topicBLabel && label !== topicALabel) {
      topicBLabel = label;
      break;
    }
  }
  expect(topicALabel, "need at least one real Topic chip").toBeTruthy();

  // ── CASE 2: topic A → topic B, region unchanged ──
  const locKeyCase1 = case1Feed.locationKey;
  const feed2aP = waitNeighborhoodFeed(page, (h) => Boolean(h.category) && !h.globalFeed);
  await page.getByRole("tab", { name: topicALabel!, exact: true }).first().click();
  const feed2a = await feed2aP;
  expect(feed2a.globalFeed, "CASE 2 FAIL: globalFeed").toBe(false);
  expect(feed2a.locationKey, "CASE 2 FAIL: locationKey changed/missing").toBe(locKeyCase1);
  expect(feed2a.category, "CASE 2 FAIL: no topic category").toBeTruthy();
  const topicASlug = feed2a.category!;
  console.log("CASE_2A_PASS", { feed: feed2a, topicALabel });

  if (topicBLabel) {
    const feed2bP = waitNeighborhoodFeed(page, (h) => Boolean(h.category) && h.category !== topicASlug && !h.globalFeed);
    await page.getByRole("tab", { name: topicBLabel, exact: true }).first().click();
    const feed2b = await feed2bP;
    expect(feed2b.locationKey).toBe(locKeyCase1);
    expect(feed2b.category).toBeTruthy();
    expect(feed2b.category).not.toBe(topicASlug);
    console.log("CASE_2B_PASS", { feed: feed2b, topicBLabel });
    // return to topic A for later cases
    const backA = waitNeighborhoodFeed(page, (h) => h.category === topicASlug);
    await page.getByRole("tab", { name: topicALabel!, exact: true }).first().click();
    await backA;
  } else {
    console.log("CASE_2B_SKIP", "only one real topic chip");
  }
  console.log("CASE_2_PASS");

  // ── CASE 3: popular mode keeps region ──
  // Go to all first
  const toAll = waitNeighborhoodFeed(page, (h) => !h.category || h.category === "");
  const allTab = page.getByRole("tab", { name: /전체|All/i }).first();
  if (await allTab.isVisible().catch(() => false)) {
    await allTab.click();
    await toAll.catch(() => null);
  } else {
    await page.goto(`${origin}/philife`, { waitUntil: "domcontentloaded" });
    await waitNeighborhoodFeed(page).catch(() => null);
  }

  const feed3P = waitNeighborhoodFeed(
    page,
    (h) => h.sort === "popular" && !h.globalFeed && Boolean(h.locationKey)
  );
  await modePopular.click();
  const feed3 = await feed3P;
  if (feed3.globalFeed || !feed3.locationKey || feed3.locationKey !== locKeyCase1) {
    const cause = feed3.globalFeed
      ? "popular used globalFeed"
      : `locationKey mismatch actual=${feed3.locationKey} expected=${locKeyCase1}`;
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_3",
          EXPECTED: "same region + popular sort",
          ACTUAL: feed3,
          AUTHORITY: "community-feed-mode popular → sort=popular + locationKey",
          FILE: "components/community/CommunityFeed.tsx",
          CAUSE: cause,
        },
        null,
        2
      )
    );
    expect(cause, `CASE 3 FAIL: ${cause}`).toBeNull();
  }
  console.log("CASE_3_PASS", { feed: feed3 });

  // ── CASE 4: popular + topic A ──
  const feed4P = waitNeighborhoodFeed(
    page,
    (h) => h.sort === "popular" && h.category === topicASlug && !h.globalFeed
  );
  await page.getByRole("tab", { name: topicALabel!, exact: true }).first().click();
  const feed4 = await feed4P;
  expect(feed4.locationKey).toBe(locKeyCase1);
  expect(feed4.sort).toBe("popular");
  expect(feed4.category).toBe(topicASlug);
  console.log("CASE_4_PASS", { feed: feed4 });

  // switch back to local + topic A for detail
  const feedLocalTopicP = waitNeighborhoodFeed(
    page,
    (h) => (h.sort !== "popular" || !h.sort) && h.category === topicASlug
  );
  await modeLocal.click();
  await feedLocalTopicP;

  // ── CASE 5: detail back keeps mode+topic ──
  const beforeDetail = page.url();
  const card = page.locator('a[href*="/philife/"]').filter({ hasNot: page.locator('[href*="write"]') }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await page.waitForURL(/\/philife\/[0-9a-f-]{8,}/i, { timeout: 20_000 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const afterBack = page.url();
  const backSp = new URL(afterBack).searchParams;
  const backCategory = (backSp.get("category") ?? "").trim().toLowerCase();
  const backSort = (backSp.get("sort") ?? "").trim().toLowerCase();
  const case5Fail =
    backCategory !== topicASlug
      ? `topic lost after back: got category=${backCategory}`
      : backSort === "popular"
        ? "mode flipped to popular after back (expected local)"
        : null;
  if (case5Fail) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_5",
          EXPECTED: { beforeDetail, topic: topicASlug, mode: "local" },
          ACTUAL: { afterBack, backCategory, backSort },
          AUTHORITY: "browser history + hub URL state",
          FILE: "components/community/CommunityFeed.tsx",
          CAUSE: case5Fail,
        },
        null,
        2
      )
    );
    expect(case5Fail, `CASE 5 FAIL: ${case5Fail}`).toBeNull();
  }
  console.log("CASE_5_PASS", { beforeDetail, afterBack });

  // ── CASE 6: bottom tab leave + return restores hub state ──
  await modePopular.click();
  await waitNeighborhoodFeed(page, (h) => h.sort === "popular" && h.category === topicASlug);
  const hubBeforeLeave = page.url();
  await page.goto(`${origin}/market`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.goto(`${origin}/philife`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const afterTab = page.url();
  const tabSp = new URL(afterTab).searchParams;
  const tabCat = (tabSp.get("category") ?? "").trim().toLowerCase();
  const tabSort = (tabSp.get("sort") ?? "").trim().toLowerCase();
  const case6Fail =
    tabCat !== topicASlug
      ? `topic not restored: ${tabCat}`
      : tabSort !== "popular"
        ? `popular mode not restored: sort=${tabSort}`
        : null;
  if (case6Fail) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_6",
          EXPECTED: { hubBeforeLeave, topic: topicASlug, sort: "popular" },
          ACTUAL: { afterTab, tabCat, tabSort },
          AUTHORITY: "community_hub_state_v1 sessionStorage restore",
          FILE: "components/community/CommunityFeed.tsx",
          CAUSE: case6Fail,
        },
        null,
        2
      )
    );
    expect(case6Fail, `CASE 6 FAIL: ${case6Fail}`).toBeNull();
  }
  console.log("CASE_6_PASS", { hubBeforeLeave, afterTab });

  // ── CASE 7: write with topic A returns to same context ──
  await page.goto(`${origin}/philife/write?category=${encodeURIComponent(topicASlug)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(800);
  // Prefer existing form fields — if write UI blocked (region/login), fail with FIRST BREAK
  const title = page.locator('input[name="title"], textarea[name="title"], input[placeholder*="제목"], input[aria-label*="제목"]').first();
  const body = page.locator('textarea[name="content"], textarea[placeholder*="내용"], [contenteditable="true"]').first();
  const submit = page.getByRole("button", { name: /등록|게시|올리기|Submit|Post/i }).first();
  const canWrite =
    (await title.isVisible().catch(() => false)) || (await body.isVisible().catch(() => false));
  if (!canWrite) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_7",
          EXPECTED: "write form for Topic A",
          ACTUAL: { url: page.url() },
          AUTHORITY: "PhilifeNeighborhoodWriteForm",
          FILE: "components/philife/PhilifeNeighborhoodWriteForm.tsx",
          CAUSE: "write form not visible (region/login/UI gate)",
        },
        null,
        2
      )
    );
    expect(canWrite, "CASE 7 FAIL: write form not visible").toBe(true);
  }
  const stamp = `slice1-rt-${Date.now()}`;
  if (await title.isVisible().catch(() => false)) {
    await title.fill(stamp);
  }
  if (await body.isVisible().catch(() => false)) {
    await body.fill(`${stamp} runtime body`);
  }
  const writeResP = page.waitForResponse(
    (r) =>
      (r.url().includes("/api/philife/neighborhood-posts") ||
        r.url().includes("/api/community/neighborhood-posts")) &&
      r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await submit.click();
  const writeRes = await writeResP;
  const writeJson = (await writeRes.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    error?: string;
    topic_slug?: string;
    category?: string;
  };
  if (!writeRes.ok() || writeJson.ok === false) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_7",
          EXPECTED: "POST neighborhood-posts ok with topic A + region",
          ACTUAL: { status: writeRes.status(), writeJson },
          AUTHORITY: "neighborhood-posts writer",
          FILE: "app/api/community/neighborhood-posts/route.ts",
          CAUSE: writeJson.error ?? `http ${writeRes.status()}`,
        },
        null,
        2
      )
    );
    expect(writeRes.ok(), `CASE 7 FAIL write: ${writeJson.error ?? writeRes.status()}`).toBe(true);
  }
  await page.waitForURL(/\/philife/, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  const afterWrite = page.url();
  const aw = new URL(afterWrite).searchParams;
  const awCat = (aw.get("category") ?? "").trim().toLowerCase();
  const case7Fail =
    awCat !== topicASlug ? `return context topic mismatch: ${awCat} vs ${topicASlug}` : null;
  if (case7Fail) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_7",
          EXPECTED: { topic: topicASlug, hubReturn: true },
          ACTUAL: { afterWrite, writeJson },
          AUTHORITY: "write return → buildCommunityFeedHref",
          FILE: "components/philife/PhilifeNeighborhoodWriteForm.tsx",
          CAUSE: case7Fail,
        },
        null,
        2
      )
    );
    expect(case7Fail, `CASE 7 FAIL: ${case7Fail}`).toBeNull();
  }
  console.log("CASE_7_PASS", { afterWrite, writeJson });

  // ── CASE 8: Admin shows same topicSlug ──
  const postId = String(writeJson.id ?? "").trim();
  expect(postId, "CASE 8 needs created post id").toBeTruthy();
  // Prefer admin session if available; else member may 403 — then FIRST BREAK
  const adminList = await page.request.get(
    `${origin}/api/admin/community/engine/posts?limit=100&topicSlug=${encodeURIComponent(topicASlug)}`
  );
  if (!adminList.ok()) {
    // try ensure still member; admin may need separate login — report FIRST BREAK if 403
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_8",
          EXPECTED: "admin posts list readable with topicSlug filter",
          ACTUAL: { status: adminList.status() },
          AUTHORITY: "GET /api/admin/community/engine/posts",
          FILE: "app/api/admin/community/engine/posts/route.ts",
          CAUSE: `admin API status ${adminList.status()} (need admin session)`,
        },
        null,
        2
      )
    );
    expect(adminList.ok(), `CASE 8 FAIL: admin API ${adminList.status()}`).toBe(true);
  }
  const adminJson = (await adminList.json()) as {
    ok?: boolean;
    posts?: Array<{ id?: string; topicSlug?: string; topic_slug?: string; category?: string }>;
  };
  const row = (adminJson.posts ?? []).find((p) => String(p.id) === postId);
  const adminTopic = String(row?.topicSlug ?? row?.topic_slug ?? "").trim().toLowerCase();
  const case8Fail = !row
    ? "created post not in admin topicSlug filter list"
    : adminTopic !== topicASlug
      ? `admin topic=${adminTopic} app topic=${topicASlug} category=${row.category}`
      : null;
  if (case8Fail) {
    console.log(
      JSON.stringify(
        {
          FIRST_BREAK: "CASE_8",
          EXPECTED: { topicASlug, postId },
          ACTUAL: { row, adminTopic },
          AUTHORITY: "neighborhoodPostTopicUiSlug on admin list",
          FILE: "app/api/admin/community/engine/posts/route.ts",
          CAUSE: case8Fail,
        },
        null,
        2
      )
    );
    expect(case8Fail, `CASE 8 FAIL: ${case8Fail}`).toBeNull();
  }
  console.log("CASE_8_PASS", { postId, adminTopic, category: row?.category });

  console.log(
    JSON.stringify({
      COMMUNITY_SLICE_1: "CLOSED_CANDIDATE",
      CASE_1: "PASS",
      CASE_2: "PASS",
      CASE_3: "PASS",
      CASE_4: "PASS",
      CASE_5: "PASS",
      CASE_6: "PASS",
      CASE_7: "PASS",
      CASE_8: "PASS",
      topicASlug,
      locationKey: locKeyCase1,
    })
  );
});
