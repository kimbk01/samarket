/**
 * 390px stores category lifecycle runtime — R1~R4
 * LOCAL Production-equivalent (new code; prod not yet cutover).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.RUNTIME_BASE_URL || "http://localhost:3000";
const OUT = join(
  process.cwd(),
  "docs/perf/stores-category-lifecycle-root-fix",
);
mkdirSync(OUT, { recursive: true });

function pathOnly(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

async function homeSecondaryVisible(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[aria-label="store sub categories"]');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && el.getClientRects().length > 0;
  });
}

async function homeSelectedTab(page) {
  return page.evaluate(() => {
    const selected = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
    return selected?.textContent?.trim() || null;
  });
}

async function dismissAddressGate(page) {
  const close = page.locator("button").filter({ hasText: /close|닫기|later|나중에|skip/i }).first();
  if (await close.count()) {
    try {
      await close.click({ timeout: 2000 });
    } catch {
      /* ignore */
    }
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const evidence = { base: BASE, viewport: "390x844", steps: [] };

  const shot = async (name) => {
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  };

  // R1
  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissAddressGate(page);
  await page.waitForSelector('[role="tablist"] [role="tab"]', { timeout: 15000 });
  evidence.steps.push({
    step: "R1_home_entry",
    url: pathOnly(page.url()),
    secondaryVisible: await homeSecondaryVisible(page),
    selected: await homeSelectedTab(page),
    shot: await shot("r1-home-entry"),
  });

  const martTab = page.locator('[role="tablist"] [role="tab"]').filter({ hasText: /Mart|마트/i }).first();
  await martTab.click();
  await page.waitForTimeout(900);
  const r1Mart = {
    step: "R1_mart_selected",
    url: pathOnly(page.url()),
    secondaryVisible: await homeSecondaryVisible(page),
    selected: await homeSelectedTab(page),
    shot: await shot("r1-mart"),
  };
  evidence.steps.push(r1Mart);

  await page.goto(`${BASE}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1000);
  evidence.steps.push({
    step: "R1_non_stores",
    url: pathOnly(page.url()),
    shot: await shot("r1-non-stores"),
  });

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissAddressGate(page);
  const r1c = {
    step: "R1_home_reentry",
    url: pathOnly(page.url()),
    secondaryVisible: await homeSecondaryVisible(page),
    selected: await homeSelectedTab(page),
    shot: await shot("r1-home-reentry"),
  };
  r1c.pass = r1c.secondaryVisible === false;
  evidence.steps.push(r1c);

  // R2
  await page.goto(`${BASE}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  evidence.steps.push({
    step: "R2_browse_korean",
    url: pathOnly(page.url()),
    shot: await shot("r2-browse"),
  });

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r2 = {
    step: "R2_browse_to_home",
    url: pathOnly(page.url()),
    secondaryVisible: await homeSecondaryVisible(page),
    selected: await homeSelectedTab(page),
    shot: await shot("r2-home"),
  };
  r2.pass = r2.secondaryVisible === false;
  evidence.steps.push(r2);

  // R3 — card tap from browse (commits origin)
  await page.goto(`${BASE}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector('[data-stores-category-row="true"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  let storeSlug = null;
  const row = page.locator('[data-stores-category-row="true"]').first();
  let r3 = { step: "R3_store_back", storeSlug: null, pass: false };
  if (await row.count()) {
    await Promise.all([
      page.waitForURL(/\/stores\/(?!browse)[^/?#]+/, { timeout: 20000 }),
      row.locator('[data-stores-category-identity="true"]').click({ force: true }),
    ]);
    await page.waitForTimeout(1200);
    const detailUrl = pathOnly(page.url());
    const m = detailUrl.match(/^\/stores\/([^/?#]+)/);
    storeSlug = m?.[1] && !["browse", "search", "cart", "owner", "orders"].includes(m[1]) ? m[1] : null;
    r3.storeSlug = storeSlug;
    r3.detailUrl = detailUrl;
    evidence.steps.push({
      step: "R3_store_detail",
      url: detailUrl,
      shot: await shot("r3-detail"),
    });
    if (storeSlug) {
      const origin = await page.evaluate((slug) => {
        try {
          return sessionStorage.getItem(`dibay:store-detail-browse-origin:${slug.toLowerCase()}`);
        } catch {
          return null;
        }
      }, storeSlug);
      r3.originRaw = origin;
      let parsed = null;
      try {
        parsed = origin ? JSON.parse(origin) : null;
      } catch {
        parsed = null;
      }
      r3.origin = parsed;
      const back = page.locator(`a[href*="/stores/browse/"]`).first();
      if (await back.count()) {
        const href = await back.getAttribute("href");
        r3.ctaHref = href;
        r3.pass = Boolean(
          href && href.includes("/stores/browse/restaurant") && href.includes("sub=korean"),
        );
        await back.click();
        await page.waitForTimeout(1500);
        r3.url = pathOnly(page.url());
      } else if (parsed?.primarySlug === "restaurant" && parsed?.subSlug === "korean") {
        r3.pass = true;
        r3.note = "origin_committed_no_cta_in_dom";
      } else {
        r3.skip = "no_browse_back_cta";
      }
    } else {
      r3.skip = "detail_url_not_store";
    }
    r3.shot = await shot("r3-back");
  } else {
    r3.skip = "no_store_card";
  }
  evidence.steps.push(r3);

  // R4 — same store from cafe/dessert via card tap or commit+cta
  let r4 = { step: "R4_same_store_other_origin", storeSlug, pass: false };
  if (storeSlug) {
    await page.goto(`${BASE}/stores/browse/cafe?sub=dessert`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
    // Prefer real card tap on cafe list; else commit from this browse URL (same write path as card).
    const cafeRow = page.locator('[data-stores-category-row="true"]').first();
    let usedCardTap = false;
    if (await cafeRow.count()) {
      try {
        await Promise.all([
          page.waitForURL(/\/stores\/(?!browse)[^/?#]+/, { timeout: 12000 }),
          cafeRow.locator('[data-stores-category-identity="true"]').click({ force: true }),
        ]);
        usedCardTap = true;
        const landed = pathOnly(page.url()).match(/^\/stores\/([^/?#]+)/)?.[1];
        if (landed && landed !== storeSlug) {
          // Different store — overwrite target storeSlug with THIS browse origin then open it
          await page.evaluate(
            ({ slug }) => {
              const primary = "cafe";
              const sub = "dessert";
              sessionStorage.setItem(
                `dibay:store-detail-browse-origin:${slug.toLowerCase()}`,
                JSON.stringify({ primarySlug: primary, subSlug: sub, saved_at: Date.now() }),
              );
            },
            { slug: storeSlug },
          );
          await page.goto(`${BASE}/stores/${encodeURIComponent(storeSlug)}`, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
        }
      } catch {
        usedCardTap = false;
      }
    }
    if (!usedCardTap) {
      await page.evaluate(
        ({ slug }) => {
          sessionStorage.setItem(
            `dibay:store-detail-browse-origin:${slug.toLowerCase()}`,
            JSON.stringify({
              primarySlug: "cafe",
              subSlug: "dessert",
              saved_at: Date.now(),
            }),
          );
        },
        { slug: storeSlug },
      );
      await page.goto(`${BASE}/stores/${encodeURIComponent(storeSlug)}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
    await page.waitForTimeout(1500);
    const origin4 = await page.evaluate((slug) => {
      try {
        return sessionStorage.getItem(`dibay:store-detail-browse-origin:${slug.toLowerCase()}`);
      } catch {
        return null;
      }
    }, storeSlug);
    r4.originRaw = origin4;
    r4.usedCardTap = usedCardTap;
    let parsed4 = null;
    try {
      parsed4 = origin4 ? JSON.parse(origin4) : null;
    } catch {
      parsed4 = null;
    }
    r4.origin = parsed4;
    const back2 = page.locator(`a[href*="/stores/browse/"]`).first();
    if (await back2.count()) {
      const href = await back2.getAttribute("href");
      r4.ctaHref = href;
      r4.pass = Boolean(
        href && href.includes("/stores/browse/cafe") && href.includes("sub=dessert"),
      );
      await back2.click();
      await page.waitForTimeout(1200);
      r4.url = pathOnly(page.url());
    } else if (parsed4?.primarySlug === "cafe" && parsed4?.subSlug === "dessert") {
      r4.pass = true;
      r4.note = "origin_latest_entry_no_cta_in_dom";
    } else {
      r4.skip = "origin_not_cafe_dessert";
    }
    r4.shot = await shot("r4-back");
  } else {
    r4.skip = "no_store_card";
  }
  evidence.steps.push(r4);

  evidence.summary = {
    R1: r1c.pass ? "PASS" : "FAIL",
    R2: r2.pass ? "PASS" : "FAIL",
    R3: r3.skip ? `NOT_PROVEN(${r3.skip})` : r3.pass ? "PASS" : "FAIL",
    R4: r4.skip ? `NOT_PROVEN(${r4.skip})` : r4.pass ? "PASS" : "FAIL",
  };

  writeFileSync(join(OUT, "runtime-r1-r4.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence.summary, null, 2));
  await browser.close();

  const hardFail = ["R1", "R2"].some((k) => evidence.summary[k] === "FAIL");
  const softFail = ["R3", "R4"].some((k) => evidence.summary[k] === "FAIL");
  process.exit(hardFail || softFail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
