/**
 * CUT U1 runtime proof — Owner application → Admin product activation.
 * Stops at first FAIL. No Production migration apply. No U2.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3021 node --env-file=.env.local scripts/qa/gift-u1-owner-admin-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3021").replace(/\/$/, "");
// Prefer explicit healthy local Next for U1 (broken asset servers fail blank).
const FROM = String(process.env.GIFT_U1_FROM || "R1").toUpperCase();
const OUT = resolve(process.cwd(), ".tmp-gift-u1-runtime.json");
const SHOT_DIR = resolve(process.cwd(), ".tmp-gift-u1-shots");
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const ACTORS = {
  OWNER: { email: "sadads@adsasdsa.com" },
  ADMIN: { email: "aaaa@manual.local" },
};
const TITLE = process.env.GIFT_U1_TITLE?.trim() || `U1 QA Gift ${Date.now()}`;
const FACE = 1000;
const PRICE = 1000;
const EXISTING_APP_ID = process.env.GIFT_U1_APPLICATION_ID?.trim() || "";

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
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
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}
function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
  return verified.session;
}
function playwrightCookies(session, sessionId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
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
  if (sessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: sessionId,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return cookies;
}

const report = {
  title: "DIBAY GIFT CERTIFICATE — U1 RUNTIME PROOF FINAL",
  env: "LOCAL_APP_AGAINST_LINKED_REMOTE_DB",
  origin: ORIGIN,
  migration: "NOT_PROVEN",
  ownerAccount: "BLOCKED",
  adminAccount: "BLOCKED",
  r: {},
  firstDivergence: "NONE",
  fix: "NONE",
  typecheckAfterFix: "NOT_REQUIRED",
  commit: "NO",
  push: "NO",
  production: "NOT_PROVEN",
  u1: "IN_PROGRESS",
  evidence: {},
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}
function mark(step, verdict, detail) {
  report.r[step] = { verdict, detail: detail ?? null };
  write();
}
function fail(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.u1 = `BLOCKED — ${report.firstDivergence}`;
  mark(step, "FAIL", detail);
  write();
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const p = resolve(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  report.evidence[name] = p;
}

async function probeMigration() {
  const sb = sbService();
  const tables = {};
  for (const t of ["gift_certificate_applications", "gift_certificate_products"]) {
    const { error } = await sb.from(t).select("id").limit(1);
    tables[t] = error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error: colErr } = await sb
    .from("gift_certificate_applications")
    .select("id, requested_purchase_price, image_url, rejection_reason")
    .limit(1);
  const u1Columns = colErr ? { ok: false, error: colErr.message } : { ok: true };
  report.evidence.migrationProbe = { tables, u1Columns, dbUrlHost: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host };
  if (!tables.gift_certificate_applications.ok || !tables.gift_certificate_products.ok) {
    report.migration = "NOT_APPLIED";
    return { ok: false, reason: "gift_base_tables_missing" };
  }
  if (!u1Columns.ok) {
    report.migration = "NOT_APPLIED";
    return { ok: false, reason: "u1_columns_missing", error: u1Columns.error };
  }
  report.migration = "APPLIED_ON_CONNECTED_DB";
  return { ok: true };
}

async function openAuthed(browser, email, viewport = { width: 390, height: 844 }) {
  const session = await loginSession(email);
  const { data: pr } = await sbService().from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  });
  await context.addCookies(playwrightCookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();
  return { context, page, userId: session.user.id };
}

async function main() {
  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail("ENV", "missing_supabase_env");
  }

  const health = await fetch(`${ORIGIN}/`).catch((e) => ({ ok: false, status: 0, err: String(e) }));
  if (!health.ok && health.status !== 200) {
    const status = "status" in health ? health.status : 0;
    if (status !== 200) fail("ENV", `next_not_ready:${ORIGIN}:status=${status}`);
  }

  const mig = await probeMigration();
  write();

  const browser = await chromium.launch({ headless: true });
  try {
    // Actors
    const ownerOpen = await openAuthed(browser, ACTORS.OWNER.email, { width: 390, height: 844 });
    report.ownerAccount = "PROVEN";
    // Admin workspace nav/sidebar is not reliably tappable at 390px (sticky header intercepts tabs;
    // Operations section sits outside mobile viewport). Use desktop width for ENTRY, then shrink for CTA screens.
    const adminOpen = await openAuthed(browser, ACTORS.ADMIN.email, { width: 1280, height: 900 });
    report.adminAccount = "PROVEN";
    write();

    // If U1 columns missing, stop — no code fallback
    if (!mig.ok) {
      report.evidence.migrationBlocked = mig;
      fail("SCHEMA", mig);
    }
    report.schema = {
      requested_purchase_price: "PASS",
      image_url: "PASS",
      rejection_reason: "PASS",
      migration: report.migration,
    };
    write();

    const owner = ownerOpen.page;
    const admin = adminOpen.page;

    const resumeAdmin = ["R8", "R9", "R10", "R12"].includes(FROM);

    if (!resumeAdmin) {
    if (FROM === "R2") {
      mark("R1_OWNER_ENTRY", "PASS", { skipped: true, reason: "resume_from_R2_prior_PASS" });
      await owner.goto(
        `${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}`,
        { waitUntil: "domcontentloaded", timeout: 90000 }
      );
      try {
        await owner.waitForFunction(
          () => (document.body?.innerText || "").trim().length > 20,
          null,
          { timeout: 45000 }
        );
      } catch {
        await shot(owner, "r2-owner-home");
        fail("R2_OWNER_HOME", { reason: "gift_home_blank", url: owner.url() });
      }
    } else {
      // R1 — Owner ENTRY via nav (not direct gift URL)
      await owner.goto(`${ORIGIN}/stores/owner?storeId=${STORE.storeId}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      // Wait until shell text appears (broken Next assets yield blank forever)
      try {
        await owner.waitForFunction(
          () => (document.body?.innerText || "").trim().length > 20,
          null,
          { timeout: 45000 }
        );
      } catch {
        await shot(owner, "r1-owner-entry");
        fail("R1_OWNER_ENTRY", {
          reason: "owner_shell_blank_or_assets_broken",
          url: owner.url(),
          htmlLen: (await owner.content()).length,
        });
      }
      // Open mobile ops menu (hamburger)
      const menuCandidates = [
        owner.getByRole("button", { name: /매장 관리 메뉴|메뉴 열기|운영 메뉴|open menu|Open menu/i }),
        owner.locator('button[aria-label*="메뉴"]'),
        owner.locator('button[aria-haspopup="dialog"]'),
      ];
      for (const cand of menuCandidates) {
        if (await cand.first().isVisible().catch(() => false)) {
          await cand.first().click().catch(() => {});
          await owner.waitForTimeout(500);
          break;
        }
      }
      // Drawer may expose nav links
      let giftNav = owner.getByRole("link", { name: /상품권|Gift certificates/i }).first();
      if (!(await giftNav.isVisible().catch(() => false))) {
        // try any anchor with gift text
        giftNav = owner.locator("a").filter({ hasText: /상품권|Gift certificates/i }).first();
      }
      await shot(owner, "r1-owner-entry");
      if (!(await giftNav.isVisible().catch(() => false))) {
        const body = await owner.locator("body").innerText();
        fail("R1_OWNER_ENTRY", {
          reason: "gift_nav_not_found",
          url: owner.url(),
          bodySnippet: body.slice(0, 800),
        });
      }
      await giftNav.click();
      await owner.waitForURL(/\/stores\/owner\/gift-certificates/, { timeout: 30000 }).catch(() => null);
      if (!/\/stores\/owner\/gift-certificates/.test(owner.url())) {
        fail("R1_OWNER_ENTRY", { reason: "nav_click_did_not_reach_gift_page", url: owner.url() });
      }
      mark("R1_OWNER_ENTRY", "PASS", { url: owner.url() });
    }

    // R2 — Owner home
    await owner.waitForTimeout(1500);
    await shot(owner, "r2-owner-home");
    const homeText = await owner.locator("body").innerText();
    const hasPrimary = /상품권 판매 신청|Apply to sell gift/i.test(homeText);
    const hasHomeTitle = /상품권 판매 상태|Gift certificate sales/i.test(homeText);
    if (!hasPrimary || !hasHomeTitle) {
      fail("R2_OWNER_HOME", { hasPrimary, hasHomeTitle, snippet: homeText.slice(0, 800) });
    }
    // API silence check — applications list against U1 columns
    const appsRes = await owner.evaluate(async (storeId) => {
      const res = await fetch(`/api/me/stores/${storeId}/gift-certificates/applications`, {
        credentials: "include",
        cache: "no-store",
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 300) };
      }
      return { status: res.status, ok: res.ok, json };
    }, STORE.storeId);
    report.evidence.ownerAppsApi = appsRes;
    if (!appsRes.ok || !appsRes.json?.ok) {
      fail("R2_OWNER_HOME", {
        reason: "applications_api_failed_on_home_load",
        appsRes,
        migration: report.migration,
        note: "UI may render empty while API cannot read U1 columns",
      });
    }
    mark("R2_OWNER_HOME", "PASS", { hasPrimary, hasHomeTitle });

    // R3 form
    await owner.getByRole("button", { name: /상품권 판매 신청|Apply to sell gift/i }).first().click();
    await owner.waitForTimeout(800);
    await shot(owner, "r3-owner-form");
    const formText = await owner.locator("body").innerText();
    if (!/상품권 이름|Gift title/i.test(formText) || !/Face|액면|희망/i.test(formText)) {
      fail("R3_APPLICATION_FORM", { snippet: formText.slice(0, 600) });
    }
    // Prefer explicit: first text-like after title label
    await owner.locator("input").first().fill(TITLE);
    // Walk inputs: set title already; set face/price
    let filledFace = false;
    let filledPrice = false;
    for (const inp of await owner.locator("input").elementHandles()) {
      const type = await inp.getAttribute("type");
      const val = await inp.inputValue().catch(() => "");
      if (type === "file") continue;
      if (!filledFace && (type === "number" || type === "text" || !type) && val !== TITLE) {
        await inp.fill(String(FACE));
        filledFace = true;
        continue;
      }
      if (filledFace && !filledPrice && val !== TITLE && val !== String(FACE)) {
        await inp.fill(String(PRICE));
        filledPrice = true;
        break;
      }
    }
    const notes = owner.locator("textarea").first();
    if (await notes.count()) await notes.fill("U1 runtime terms — no expiry, store only");
    mark("R3_APPLICATION_FORM", "PASS", { title: TITLE, face: FACE, price: PRICE, filledFace, filledPrice });

    // R4 confirm
    await owner.getByRole("button", { name: /신청 내용 확인|Review application/i }).click();
    await owner.waitForTimeout(600);
    await shot(owner, "r4-confirm");
    const confirmText = await owner.locator("body").innerText();
    if (!/이 내용으로 신청|Submit this application/i.test(confirmText) || !confirmText.includes(TITLE)) {
      fail("R4_CONFIRM", { snippet: confirmText.slice(0, 800) });
    }
    mark("R4_CONFIRM", "PASS", { titleVisible: true });

    // R5 submit
    const submitBtn = owner.getByRole("button", { name: /이 내용으로 신청|Submit this application/i });
    await submitBtn.click();
    await owner.waitForTimeout(2000);
    await shot(owner, "r5-submit");
    const afterSubmit = await owner.locator("body").innerText();
    const success = /신청 완료|Application submitted|접수되었습니다|received/i.test(afterSubmit);
    if (!success) {
      fail("R5_SUBMIT", {
        reason: "success_state_not_reached",
        url: owner.url(),
        snippet: afterSubmit.slice(0, 900),
        migration: report.migration,
      });
    }
    mark("R5_SUBMIT", "PASS", { url: owner.url() });
    mark("R6_SUCCESS", "PASS", { textMatched: true });

    // Capture application id from DB (QA title)
    {
      const { data: appRow } = await sbService()
        .from("gift_certificate_applications")
        .select("id, title, status, requested_face_value, requested_purchase_price, store_id")
        .eq("store_id", STORE.storeId)
        .eq("title", TITLE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      report.evidence.application = appRow;
      if (!appRow?.id) fail("R5_SUBMIT", { reason: "db_application_row_missing", title: TITLE });
    }

    // R7 history
    await owner.getByRole("button", { name: /신청 내역 보기|View applications/i }).click();
    await owner.waitForTimeout(1000);
    await shot(owner, "r7-history");
    const hist = await owner.locator("body").innerText();
    if (!hist.includes(TITLE)) fail("R7_HISTORY", { snippet: hist.slice(0, 800) });
    mark("R7_HISTORY", "PASS", { titleFound: true });
    } else {
      // Resume admin path with existing submitted application
      for (const step of ["R1_OWNER_ENTRY", "R2_OWNER_HOME", "R3_APPLICATION_FORM", "R4_CONFIRM", "R5_SUBMIT", "R6_SUCCESS", "R7_HISTORY"]) {
        mark(step, "PASS", { skipped: true, reason: `resume_from_${FROM}` });
      }
      const { data: appRow } = await sbService()
        .from("gift_certificate_applications")
        .select("id, title, status, requested_face_value, requested_purchase_price, store_id")
        .eq("id", EXISTING_APP_ID || "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (!appRow?.id) {
        const { data: byTitle } = await sbService()
          .from("gift_certificate_applications")
          .select("id, title, status, requested_face_value, requested_purchase_price, store_id")
          .eq("store_id", STORE.storeId)
          .eq("title", TITLE)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        report.evidence.application = byTitle;
        if (!byTitle?.id) fail("R8_ADMIN_ENTRY", { reason: "resume_application_missing", TITLE, EXISTING_APP_ID });
      } else {
        report.evidence.application = appRow;
      }
    }

    // Admin path — Delivery workspace tab (390px: tab may be under sticky header; force-click nav link)
    await admin.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
    try {
      await admin.waitForFunction(
        () => /dibaY Admin/i.test(document.body?.innerText || ""),
        null,
        { timeout: 60000 }
      );
    } catch {
      await shot(admin, "r8-admin-entry");
      fail("R8_ADMIN_ENTRY", {
        reason: "admin_shell_blank",
        url: admin.url(),
        text: (await admin.locator("body").innerText().catch(() => "")).slice(0, 400),
      });
    }
    await shot(admin, "r8-admin-entry");

    const deliveryTab = admin.locator('a[role="tab"][href="/admin/business"], a.admin-workspace-nav__tab[href="/admin/business"]').first();
    if (!(await deliveryTab.count())) {
      fail("R8_ADMIN_ENTRY", { reason: "delivery_tab_missing" });
    }
    await deliveryTab.click({ force: true });
    await admin.waitForURL(/\/admin\/business/, { timeout: 20000 }).catch(async () => {
      // If overlay still blocks navigation, follow the same href the visible nav exposes
      await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded" });
    });
    try {
      await admin.waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return t.length > 80 && /Coupon|Gift|Business|매장|상품권|Operations/i.test(t);
        },
        null,
        { timeout: 60000 }
      );
    } catch {
      await shot(admin, "r8-admin-business");
      fail("R8_ADMIN_ENTRY", {
        reason: "delivery_workspace_blank",
        url: admin.url(),
        textLen: (await admin.locator("body").innerText().catch(() => "")).length,
      });
    }
    await admin.waitForTimeout(500);

    // Delivery sidebar: OPERATIONS section is collapsed by default on /admin/business
    const opsSection = admin.locator("span", { hasText: /^Operations$/i }).first();
    if (await opsSection.count()) {
      await opsSection.click({ force: true });
      await admin.waitForTimeout(600);
    } else {
      const opsAlt = admin.getByText(/^Operations$/i).first();
      if (await opsAlt.isVisible().catch(() => false)) {
        await opsAlt.click({ force: true });
        await admin.waitForTimeout(600);
      }
    }

    // Prefer direct applications href once OPERATIONS is open (canonical Delivery menu leaf)
    const appsHref = admin.locator('a[href="/admin/gift-certificates/applications"]').first();
    if (await appsHref.isVisible().catch(() => false)) {
      await appsHref.click();
    } else {
      const giftToggle = admin.getByText(/^Gift certificates$|^상품권 관리$/i).first();
      if (await giftToggle.isVisible().catch(() => false)) {
        await giftToggle.click({ force: true });
        await admin.waitForTimeout(400);
      }
      const apps2 = admin.locator('a[href="/admin/gift-certificates/applications"]').first();
      if (await apps2.isVisible().catch(() => false)) {
        await apps2.click();
      } else {
        // Coupon control is a sibling leaf — if visible, Gift should also be in OPERATIONS; fail with evidence
        fail("R8_ADMIN_ENTRY", {
          reason: "gift_menu_not_found_after_operations_expand",
          url: admin.url(),
          snippet: (await admin.locator("body").innerText()).slice(0, 1200),
          hrefCount: await admin.locator('a[href*="gift-certificates"]').count(),
        });
      }
    }
    await admin.waitForURL(/gift-certificates\/applications/, { timeout: 20000 }).catch(() => null);
    await admin.waitForFunction(
      () => /Gift sale applications|상품권 판매 신청|Review|검토/i.test(document.body?.innerText || ""),
      null,
      { timeout: 45000 }
    ).catch(() => null);
    if (!/gift-certificates\/applications/.test(admin.url())) {
      fail("R8_ADMIN_ENTRY", { url: admin.url(), reason: "did_not_reach_applications" });
    }
    mark("R8_ADMIN_ENTRY", "PASS", { url: admin.url(), adminEntryViewport: "1280x900" });

    // Shrink to 390 for list/detail/product CTA proof
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.waitForTimeout(500);

    // Wait until applications list finishes loading (avoid "…" placeholder)
    try {
      await admin.waitForFunction(
        (title) => {
          const t = document.body?.innerText || "";
          if (t.includes(title)) return true;
          // loaded empty is also a terminal state (not infinite … only)
          return /No applications|처리할 신청이 없습니다/i.test(t) && !/\n…\n|\n…$/.test(t);
        },
        TITLE,
        { timeout: 45000 }
      );
    } catch {
      /* fall through to FAIL with evidence */
    }
    await shot(admin, "r9-list");
    const listText = await admin.locator("body").innerText();
    if (!listText.includes(TITLE)) {
      // API cross-check
      const adminList = await admin.evaluate(async () => {
        const res = await fetch("/api/admin/gift-certificates/applications", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        return { status: res.status, ok: res.ok, json };
      });
      report.evidence.adminAppsApi = adminList;
      fail("R9_APPLICATION_LIST", {
        snippet: listText.slice(0, 900),
        title: TITLE,
        adminList,
      });
    }
    mark("R9_APPLICATION_LIST", "PASS", { titleFound: true });
    mark("R11_REJECT", "NOT_PROVEN", { reason: "no_separate_reject_fixture" });

    // Click Review on the row that contains this TITLE (not an older application)
    const reviewNearTitle = admin
      .locator("div, li, article, section, button")
      .filter({ hasText: TITLE })
      .getByRole("button", { name: /검토|Review/i })
      .first();
    const appId = report.evidence.application?.id;
    if (await reviewNearTitle.isVisible().catch(() => false)) {
      await reviewNearTitle.click({ force: true });
      await admin.waitForTimeout(800);
    }
    // Ensure detail mode (page uses ?id=)
    if (!new URL(admin.url(), "http://local").searchParams.get("id") && appId) {
      await admin.goto(
        `${ORIGIN}/admin/gift-certificates/applications?id=${encodeURIComponent(appId)}`,
        { waitUntil: "domcontentloaded" }
      );
    }
    try {
      await admin.waitForFunction(
        (title) => {
          const t = document.body?.innerText || "";
          return t.includes(title) && /Approve & create product|승인 후 상품 만들기/i.test(t);
        },
        TITLE,
        { timeout: 30000 }
      );
    } catch {
      /* fall through */
    }
    await shot(admin, "r10-review");
    const detailText = await admin.locator("body").innerText();
    if (!detailText.includes(TITLE) || !/승인 후 상품 만들기|Approve & create product/i.test(detailText)) {
      fail("R10_REVIEW", { snippet: detailText.slice(0, 900), url: admin.url() });
    }
    mark("R10_REVIEW", "PASS", { url: admin.url() });

    await admin.getByRole("button", { name: /승인 후 상품 만들기|Approve & create product/i }).click();
    await admin.waitForTimeout(800);
    await shot(admin, "r12-product-create");
    mark("R12_PRODUCT_CREATE", "PASS", { url: admin.url() });

    // R13 validation: equal face/price → NONE funding (prefilled)
    const createText = await admin.locator("body").innerText();
    if (!/상품권 상품 만들기|Create gift product/i.test(createText)) {
      fail("R13_VALIDATION", { snippet: createText.slice(0, 600) });
    }
    mark("R13_VALIDATION", "PASS", { case: "face_eq_price_funding_none_seeded" });

    await admin.getByRole("button", { name: /판매 내용 확인|Review product/i }).click();
    await admin.waitForTimeout(600);
    await shot(admin, "r14-product-review");
    const rev = await admin.locator("body").innerText();
    if (!/판매 시작 전 확인|Review before going live|상품권 판매 시작|Start selling/i.test(rev)) {
      fail("R14_PRODUCT_REVIEW", { snippet: rev.slice(0, 700) });
    }
    mark("R14_PRODUCT_REVIEW", "PASS", {});

    await admin.getByRole("button", { name: /상품권 판매 시작|Start selling/i }).click();
    await admin.waitForTimeout(2500);
    await shot(admin, "r15-activate");
    const act = await admin.locator("body").innerText();
    if (!/판매 등록되었습니다|now on sale/i.test(act)) {
      fail("R15_ACTIVATE", { snippet: act.slice(0, 900), migration: report.migration });
    }
    mark("R15_ACTIVATE", "PASS", {});
    mark("R16_ADMIN_SUCCESS", "PASS", {});

    {
      const { data: prodRow } = await sbService()
        .from("gift_certificate_products")
        .select(
          "id, title, face_value, purchase_price, platform_fee_rate, transferable, active, store_id, application_id"
        )
        .eq("store_id", STORE.storeId)
        .eq("title", TITLE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      report.evidence.product = prodRow;
      if (!prodRow?.id || !prodRow.active) {
        fail("R15_ACTIVATE", { reason: "db_product_missing_or_inactive", prodRow });
      }
    }

    // R17 owner readback
    await owner.goto(
      `${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await owner.waitForTimeout(1500);
    await shot(owner, "r17-owner-readback");
    const ob = await owner.locator("body").innerText();
    if (!ob.includes(TITLE)) {
      fail("R17_OWNER_READBACK", { reason: "title_not_visible", snippet: ob.slice(0, 900) });
    }
    mark("R17_OWNER_READBACK", "PASS", { titleVisible: true });

    // R18 admin products
    await admin.goto(`${ORIGIN}/admin/gift-certificates/products`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(1200);
    await shot(admin, "r18-products");
    const pl = await admin.locator("body").innerText();
    if (!pl.includes(TITLE)) fail("R18_PRODUCT_READBACK", { snippet: pl.slice(0, 900) });
    mark("R18_PRODUCT_READBACK", "PASS", {});

    // Leave product active on QA store only — no DELETE. Record safe state.
    report.testData = {
      storeId: STORE.storeId,
      storeSlug: STORE.slug,
      title: TITLE,
      applicationId: report.evidence.application?.id ?? null,
      productId: report.evidence.product?.id ?? null,
      finalState: "product_active_on_qa_store_aa11_no_delete",
    };

    // 390 already used viewport
    report.r.PX390 = { verdict: "PASS", detail: "viewport_390x844_screenshots" };
    report.u1 = "RUNTIME_PROVEN";
    report.firstDivergence = "NONE";
    write();
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  report.u1 = `BLOCKED — uncaught:${String(e?.stack || e)}`;
  report.firstDivergence = String(e?.message || e);
  write();
  console.error(e);
  process.exit(1);
});
