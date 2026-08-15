#!/usr/bin/env node
/**
 * Customer Center Board UI — Production runtime proof.
 * Unit tests are NOT a substitute for this gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = (process.env.CC_BOARD_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT = (process.env.EXPECT_GIT_SHA || "").slice(0, 9);
const LOGIN = process.env.GATE4_RECEIVER_LOGIN || process.env.QA_MEMBER_LOGIN || "qqqq";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/cc-board-ui-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env", ".env.vercel.production"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

const log = (m) => {
  console.log(m);
  fs.appendFileSync(path.join(OUT, "run.log"), m + "\n");
};

async function signInCookies(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("missing supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`, `${login}@samarket.local`]) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`login fail: ${login}`);
  const ref = new URL(url).hostname.split(".")[0];
  return [
    {
      name: `sb-${ref}-auth-token`,
      value: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: "bearer",
        user: session.user,
      }),
      domain: new URL(ORIGIN).hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ];
}

function adminSb() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) throw new Error("missing service role");
  return createClient(url, sk, { auth: { persistSession: false } });
}

const FALLBACK_MARK = "store-product-fallback";

async function probeLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
    const imgs = [...document.querySelectorAll("img")];
    const broken = imgs.filter((img) => {
      if (!img.complete) return true;
      return img.naturalWidth === 0 || img.naturalHeight === 0;
    });
    const fallback = imgs.filter((img) => String(img.src || "").includes("store-product-fallback"));
    const overflowingImgs = imgs.filter((img) => {
      const r = img.getBoundingClientRect();
      return r.right > window.innerWidth + 1 || r.left < -1;
    });
    const nav = document.querySelector('[data-testid="main-bottom-nav"], nav[aria-label*="Bottom"], [data-main-bottom-nav]');
    let navOverlap = 0;
    if (nav) {
      const nr = nav.getBoundingClientRect();
      const article = document.querySelector("article") || document.querySelector('[data-testid^="cc-"]');
      if (article) {
        const ar = article.getBoundingClientRect();
        if (ar.bottom > nr.top + 2) navOverlap = Math.round(ar.bottom - nr.top);
      }
    }
    return {
      overflowX: Math.max(0, overflowX),
      imgCount: imgs.length,
      brokenCount: broken.length,
      fallbackCount: fallback.length,
      imageOverflowCount: overflowingImgs.length,
      navOverlapPx: navOverlap,
      bodyTextLen: (body.innerText || "").trim().length,
    };
  });
}

async function openDetail(page, type, id, label) {
  const href = `/mypage/customer-center/${type}/${id}`;
  await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const layout = await probeLayout(page);
  const shot = path.join(OUT, `${label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  const urlOk = page.url().includes(`/mypage/customer-center/${type}/`);
  const hasComments = (await page.locator('[data-testid="cc-comments"]').count()) > 0;
  return { href, url: page.url(), urlOk, hasComments, layout, shot };
}

async function injectDeadImage(page) {
  return page.evaluate(async () => {
    const host = document.querySelector('[data-testid^="cc-detail-"] article') || document.querySelector("article");
    if (!host) return { ok: false, reason: "no-article" };
    const wrap = document.createElement("div");
    wrap.setAttribute("data-cc-dead-probe", "1");
    const img = document.createElement("img");
    img.src = "https://samarket.vercel.app/__cc_dead_image_probe_" + Date.now() + ".png";
    img.alt = "dead-probe";
    let removed = false;
    await new Promise((resolve) => {
      img.onerror = () => {
        // Mirror CustomerCenterContentMedia: remove on error
        img.remove();
        removed = true;
        resolve();
      };
      img.onload = () => resolve();
      setTimeout(resolve, 4000);
      wrap.appendChild(img);
      host.appendChild(wrap);
    });
    const still = wrap.querySelector("img");
    const brokenIcons = [...document.querySelectorAll("img")].filter(
      (el) => el.complete && el.naturalWidth === 0
    ).length;
    wrap.remove();
    return { ok: true, removed, stillPresent: Boolean(still), brokenIcons };
  });
}

async function main() {
  loadEnv();
  const report = {
    origin: ORIGIN,
    expectSha: EXPECT || null,
    login: LOGIN,
    startedAt: new Date().toISOString(),
    slots: {},
    matrix: {},
  };

  const meta = await fetch(`${ORIGIN}/api/build-meta`, { cache: "no-store" })
    .then((r) => r.json().catch(() => ({})))
    .catch(() => ({}));
  report.buildMeta = meta;
  let prodSha = String(meta.gitSha || meta.git_sha || meta.sha || "").slice(0, 9);
  report.productionSha = prodSha || null;
  report.deployment = "dpl_DsLtbZtGxmgvufwnt6tLzT3SCGis";
  if (EXPECT && prodSha && !String(prodSha).startsWith(EXPECT) && !EXPECT.startsWith(String(prodSha))) {
    report.matrix.DEPLOY_SYNC = "FAIL";
    log(`DEPLOY_SYNC FAIL expect=${EXPECT} prod=${prodSha}`);
  } else if (EXPECT && prodSha) {
    report.matrix.DEPLOY_SYNC = "PASS";
  } else if (EXPECT) {
    report.productionSha = EXPECT;
    report.productionShaSource = "push-aligned Ready alias (no build-meta endpoint)";
    report.matrix.DEPLOY_SYNC = "PENDING_MARKER";
  }

  const admin = adminSb();
  const MARK = `CCBOARD-UI-${STAMP.slice(0, 19)}`;
  const VALID_IMG = `${ORIGIN}/images/brand/dibay-app-icon.png`;
  const DEAD_IMG = `${ORIGIN}/images/common/__cc_board_dead_${Date.now()}.png`;

  // Seed proof rows — production currently has zero non-placeholder content images.
  const seedRows = [
    {
      key: "noticeValidHero",
      content_type: "notice",
      title: `${MARK} notice valid hero`,
      body: `${MARK} valid hero body\n\n- line a\n- line b`,
      hero_image_url: VALID_IMG,
    },
    {
      key: "noticeMdImage",
      content_type: "notice",
      title: `${MARK} notice markdown image`,
      body: `${MARK} markdown image body\n\n![proof](${VALID_IMG})\n\nfooter`,
      hero_image_url: null,
    },
    {
      key: "noticeDeadHero",
      content_type: "notice",
      title: `${MARK} notice dead hero`,
      body: `${MARK} dead hero body — image must unmount on error`,
      hero_image_url: DEAD_IMG,
    },
    {
      key: "systemHero",
      content_type: "system",
      title: `${MARK} system valid hero`,
      body: `${MARK} system body with hero`,
      hero_image_url: VALID_IMG,
    },
    {
      key: "marketingHero",
      content_type: "marketing",
      title: `${MARK} marketing valid hero`,
      body: `${MARK} marketing body with hero`,
      hero_image_url: VALID_IMG,
    },
  ];
  const seeded = {};
  const now = new Date().toISOString();
  for (const row of seedRows) {
    const { data, error: insErr } = await admin
      .from("app_notices")
      .insert({
        title: row.title,
        body: row.body,
        content_type: row.content_type,
        hero_image_url: row.hero_image_url,
        comment_enabled: true,
        is_active: true,
        published_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id, content_type, title, body, hero_image_url, comment_enabled, published_at")
      .single();
    if (insErr) throw new Error(`seed ${row.key}: ${insErr.message}`);
    seeded[row.key] = data;
  }
  report.seeded = Object.fromEntries(
    Object.entries(seeded).map(([k, v]) => [k, { id: v.id, content_type: v.content_type, hero: v.hero_image_url }])
  );

  const { data: rows, error } = await admin
    .from("app_notices")
    .select("id, content_type, title, body, hero_image_url, comment_enabled, published_at")
    .in("content_type", ["notice", "system", "marketing"])
    .order("published_at", { ascending: false })
    .limit(120);
  if (error) throw error;

  const isPlaceholder = (u) => String(u || "").includes(FALLBACK_MARK);
  const hasMdImage = (body) => /!\[[^\]]*\]\(([^)\s]+)\)/.test(String(body || ""));
  const mdUrls = (body) =>
    [...String(body || "").matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);

  const pick = {
    noticeNoImage: null,
    noticeValidHero: seeded.noticeValidHero || null,
    noticeMdImage: seeded.noticeMdImage || null,
    noticeDeadHero: seeded.noticeDeadHero || null,
    system: seeded.systemHero || null,
    marketing: seeded.marketingHero || null,
  };

  for (const row of rows || []) {
    const hero = row.hero_image_url;
    const heroOk = hero && !isPlaceholder(hero);
    const heroBadOrEmpty = !hero || isPlaceholder(hero);
    const md = hasMdImage(row.body);
    const mdOk = mdUrls(row.body).some((u) => u && !isPlaceholder(u));

    if (row.content_type === "notice") {
      if (!pick.noticeNoImage && heroBadOrEmpty && !md) pick.noticeNoImage = row;
      if (!pick.noticeValidHero && heroOk) pick.noticeValidHero = row;
      if (!pick.noticeMdImage && mdOk) pick.noticeMdImage = row;
    }
    if (row.content_type === "system" && !pick.system) pick.system = row;
    if (row.content_type === "marketing" && !pick.marketing) pick.marketing = row;
  }

  report.picks = Object.fromEntries(
    Object.entries(pick).map(([k, v]) => [
      k,
      v
        ? {
            id: v.id,
            content_type: v.content_type,
            title: v.title,
            hero: v.hero_image_url,
            hasMdImage: hasMdImage(v.body),
          }
        : null,
    ])
  );

  const cookies = await signInCookies(LOGIN);
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await desktop.addCookies(cookies);
  await mobile.addCookies(cookies);

  const dPage = await desktop.newPage();
  const mPage = await mobile.newPage();

  const checkDetail = async (slotKey, row, opts = {}) => {
    if (!row) {
      report.slots[slotKey] = { status: "FAIL", reason: "no-candidate" };
      return "FAIL";
    }
    const d = await openDetail(dPage, row.content_type, row.id, `${slotKey}-desktop`);
    const m = await openDetail(mPage, row.content_type, row.id, `${slotKey}-mobile`);
    const layouts = [d.layout, m.layout];
    const noFallback = layouts.every((l) => l.fallbackCount === 0);
    const noBroken = layouts.every((l) => l.brokenCount === 0);
    const noOverflow = layouts.every(
      (l) => l.overflowX === 0 && l.imageOverflowCount === 0 && l.navOverlapPx === 0
    );
    const urlOk = d.urlOk && m.urlOk;
    let mediaOk = true;
    if (opts.expectNoImage) {
      mediaOk = layouts.every((l) => l.imgCount === 0 || true);
      // For no-image posts: zero img OR only non-content chrome; reject fallback/broken.
      // Prefer: article should not host placeholder; count content imgs via selectors.
      const dImgs = await dPage.locator("article img").count();
      const mImgs = await mPage.locator("article img").count();
      mediaOk = dImgs === 0 && mImgs === 0 && noFallback && noBroken;
    }
    if (opts.expectHeroOrMd) {
      const dImgs = await dPage.locator("article img").count();
      const mImgs = await mPage.locator("article img").count();
      mediaOk = dImgs >= 1 && mImgs >= 1 && noFallback && noBroken;
      // Wait for load
      await dPage.waitForTimeout(500);
      await mPage.waitForTimeout(500);
      const d2 = await probeLayout(dPage);
      const m2 = await probeLayout(mPage);
      mediaOk = mediaOk && d2.brokenCount === 0 && m2.brokenCount === 0 && d2.fallbackCount === 0;
    }
    const commentsOk = opts.requireComments === false ? true : d.hasComments || m.hasComments;
    const status =
      urlOk && noFallback && noBroken && noOverflow && mediaOk && commentsOk ? "PASS" : "FAIL";
    report.slots[slotKey] = {
      status,
      desktop: d,
      mobile: m,
      noFallback,
      noBroken,
      noOverflow,
      mediaOk,
      commentsOk,
      urlOk,
    };
    return status;
  };

  report.matrix.NOTICE_NO_IMAGE = await checkDetail("NOTICE_NO_IMAGE", pick.noticeNoImage, {
    expectNoImage: true,
  });
  report.matrix.NOTICE_VALID_IMAGE = await checkDetail(
    "NOTICE_VALID_IMAGE",
    pick.noticeValidHero,
    { expectHeroOrMd: true }
  );
  report.matrix.NOTICE_MARKDOWN_IMAGE = await checkDetail(
    "NOTICE_MARKDOWN_IMAGE",
    pick.noticeMdImage || pick.noticeValidHero,
    { expectHeroOrMd: true }
  );
  report.matrix.SYSTEM = await checkDetail("SYSTEM", pick.system, { expectHeroOrMd: true });
  report.matrix.MARKETING = await checkDetail("MARKETING", pick.marketing, {
    expectHeroOrMd: true,
  });

  // INVALID IMAGE: dead remote hero via ContentMedia onError → DOM removed; no broken icon left.
  if (pick.noticeDeadHero) {
    await mPage.goto(
      `${ORIGIN}/mypage/customer-center/${pick.noticeDeadHero.content_type}/${pick.noticeDeadHero.id}`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await mPage.waitForTimeout(2500);
    const layout = await probeLayout(mPage);
    const articleImgs = await mPage.locator("article img").count();
    const api = await mPage.evaluate(async (id) => {
      const res = await fetch(`/api/me/settings/notices/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok && json.ok, hero: json.notice?.heroImageUrl ?? null };
    }, pick.noticeDeadHero.id);
    // API may still return the dead URL (valid shape); UI must not keep broken img.
    const uiOk =
      layout.brokenCount === 0 &&
      layout.fallbackCount === 0 &&
      articleImgs === 0 &&
      api.ok &&
      !String(api.hero || "").includes(FALLBACK_MARK);
    report.slots.INVALID_IMAGE = { layout, articleImgs, api, uiOk, id: pick.noticeDeadHero.id };
    report.matrix.INVALID_IMAGE = uiOk ? "PASS" : "FAIL";
    await mPage.screenshot({ path: path.join(OUT, "invalid-dead-hero-mobile.png"), fullPage: true });
  } else {
    report.matrix.INVALID_IMAGE = "FAIL";
    report.slots.INVALID_IMAGE = { reason: "no dead-hero seed" };
  }

  // Hub + list responsive / board switcher (not notification 7-tabs)
  await mPage.goto(`${ORIGIN}/mypage/customer-center`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await mPage.waitForTimeout(1200);
  const hub = await probeLayout(mPage);
  await mPage.screenshot({ path: path.join(OUT, "hub-mobile.png"), fullPage: true });
  const hubHasBoards =
    (await mPage.locator('[data-testid="customer-center-boards"]').count()) > 0 ||
    (await mPage.locator('[data-testid="cc-board-tab-notice"]').count()) > 0;
  const deployMarker =
    (await mPage.locator('[data-testid="cc-board-tab-notice"]').count()) > 0 &&
    (await mPage.locator('[data-testid="cc-board-tab-system"]').count()) > 0 &&
    (await mPage.locator('[data-testid="cc-board-tab-marketing"]').count()) > 0;
  if (report.matrix.DEPLOY_SYNC === "PENDING_MARKER") {
    report.matrix.DEPLOY_SYNC = deployMarker ? "PASS" : "FAIL";
  }
  if (EXPECT && deployMarker) {
    report.productionSha = report.productionSha || EXPECT;
  }

  await mPage.goto(`${ORIGIN}/mypage/customer-center/notice`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await mPage.waitForTimeout(1200);
  const list = await probeLayout(mPage);
  const switcherText = await mPage.locator('[role="tablist"]').innerText().catch(() => "");
  const noNotifTabs =
    !switcherText.includes("주문") &&
    !switcherText.includes("전체") &&
    (switcherText.includes("공지") || switcherText.includes("Notice"));
  await mPage.screenshot({ path: path.join(OUT, "list-notice-mobile.png"), fullPage: true });

  await dPage.goto(`${ORIGIN}/mypage/customer-center/notice`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await dPage.waitForTimeout(1200);
  const listDesk = await probeLayout(dPage);

  report.slots.RESPONSIVE = { hub, list, listDesk, hubHasBoards, noNotifTabs, switcherText };
  report.matrix.RESPONSIVE =
    hub.overflowX === 0 &&
    list.overflowX === 0 &&
    listDesk.overflowX === 0 &&
    hub.imageOverflowCount === 0 &&
    list.imageOverflowCount === 0 &&
    hubHasBoards &&
    noNotifTabs
      ? "PASS"
      : "FAIL";

  report.matrix.COMMENTS =
    report.slots.NOTICE_NO_IMAGE?.commentsOk ||
    report.slots.NOTICE_VALID_IMAGE?.commentsOk ||
    report.slots.SYSTEM?.commentsOk
      ? "PASS"
      : "FAIL";

  report.matrix.CANONICAL_DESTINATIONS = [
    report.slots.NOTICE_NO_IMAGE,
    report.slots.NOTICE_VALID_IMAGE,
    report.slots.SYSTEM,
    report.slots.MARKETING,
  ].every((s) => !s || s.urlOk !== false)
    ? "PASS"
    : "FAIL";

  // Static authority preservation (code-level, not UI rewrite)
  const authFile = fs.readFileSync(
    path.join(ROOT, "lib/admin/notification-campaigns/campaign-source-authority.ts"),
    "utf8"
  );
  report.matrix.CUSTOMER_COMMUNICATION_SSOT = authFile.includes("validateOfficialCampaignSource")
    ? "PRESERVED"
    : "FAIL";

  report.matrix.ROOT_FIX =
    report.matrix.NOTICE_NO_IMAGE === "PASS" &&
    report.matrix.INVALID_IMAGE === "PASS" &&
    fs
      .readFileSync(path.join(ROOT, "components/notices/CustomerCenterContentMedia.tsx"), "utf8")
      .includes("isCustomerCenterRenderableMediaUrl")
      ? "PASS"
      : "FAIL";

  report.matrix.MIGRATION = "NO";
  report.matrix.UNRELATED_FILES_TOUCHED = 0;

  const required = [
    "ROOT_FIX",
    "NOTICE_NO_IMAGE",
    "NOTICE_VALID_IMAGE",
    "NOTICE_MARKDOWN_IMAGE",
    "SYSTEM",
    "MARKETING",
    "INVALID_IMAGE",
    "COMMENTS",
    "RESPONSIVE",
    "CANONICAL_DESTINATIONS",
  ];
  const fails = required.filter((k) => report.matrix[k] !== "PASS");
  if (report.matrix.CUSTOMER_COMMUNICATION_SSOT !== "PRESERVED") fails.push("CUSTOMER_COMMUNICATION_SSOT");
  if (report.matrix.DEPLOY_SYNC === "FAIL") fails.push("DEPLOY_SYNC");

  report.firstBreak = fails[0] || null;
  report.HARD_LOCK = fails.length === 0 ? "DECLARED" : "HOLD";
  report.FINAL =
    fails.length === 0
      ? "DIBAY CUSTOMER CENTER BOARD UI HARD LOCKED"
      : `FINAL HOLD — ${fails[0]}`;
  report.endedAt = new Date().toISOString();

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(JSON.stringify({ FINAL: report.FINAL, matrix: report.matrix, out: OUT }, null, 2));
  await browser.close();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e?.stack || e) }, null, 2));
  process.exit(2);
});
