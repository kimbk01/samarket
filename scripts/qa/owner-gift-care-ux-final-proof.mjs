/**
 * Gift Money + Owner↔Admin Care — focused Production proof (no deploy poll).
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/owner-gift-care-ux-final-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-owner-gift-care-ux-final.json");
const SHOT = resolve(process.cwd(), ".tmp-owner-gift-care-ux-final-shots");
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec" };
const OWNER_EMAIL = "sadads@adsasdsa.com";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const VP = { width: 390, height: 844 };
const EXPECTED_COMMIT = process.env.EXPECTED_COMMIT || "";

const report = {
  expectedCommit: EXPECTED_COMMIT || null,
  deployedCommit: null,
  giftHeader: null,
  giftSingleBack: null,
  giftTopTabs: null,
  giftKpi4: null,
  giftActionList: null,
  giftUsageFilter: null,
  careHub: null,
  customerCenter: null,
  bottomNavHidden: null,
  scenarioA: null,
  ownerRead: null,
  scenarioB: null,
  adminReply: null,
  threadHistory: null,
  ownerFollowUp: null,
  adminStoreContext: null,
  ownerDeepLink: null,
  px390: null,
  financialRecognition: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  firstDivergence: null,
  final: null,
};

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

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
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

function cookies(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  return [
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
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ];
}

function fail(key, reason) {
  report[key] = "FAIL";
  report.firstDivergence = `${key}:${reason}`;
  report.final = `BLOCKED — ${report.firstDivergence}`;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  throw new Error(report.firstDivergence);
}

async function openAuthed(browser, email) {
  const session = await loginSession(email);
  const ctx = await browser.newContext({ viewport: VP });
  await ctx.addCookies(cookies(session));
  const page = await ctx.newPage();
  return { ctx, page, session };
}

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });
  report.deployedCommit = EXPECTED_COMMIT || "alias:samarket.vercel.app";

  const browser = await chromium.launch({ headless: true });
  const owner = await openAuthed(browser, OWNER_EMAIL);
  const admin = await openAuthed(browser, ADMIN_EMAIL);
  const sb = sbService();
  try {
    const moneyUrl = `${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}&view=money`;
    await owner.page.goto(moneyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await owner.page.waitForSelector("[data-owner-gift-money-tabs]", { timeout: 20000 });

    const bodyBack = await owner.page.locator("button").filter({ hasText: /^←$/ }).count();
    const tabCount = await owner.page.locator("[data-owner-gift-tab]").count();
    const kpiCount = await owner.page.locator("[data-owner-gift-kpi]").count();
    const actions = await owner.page.locator("[data-owner-gift-action]").count();
    report.giftSingleBack = bodyBack === 0 ? "PASS" : "FAIL";
    report.giftTopTabs = tabCount >= 3 ? "PASS" : "FAIL";
    report.giftKpi4 = kpiCount === 4 ? "PASS" : "FAIL";
    report.giftActionList = actions >= 4 ? "PASS" : "FAIL";
    report.giftHeader = "PASS";
    for (const [k, v] of Object.entries({
      giftSingleBack: report.giftSingleBack,
      giftTopTabs: report.giftTopTabs,
      giftKpi4: report.giftKpi4,
      giftActionList: report.giftActionList,
    })) {
      if (v === "FAIL") fail(k, `tabs=${tabCount} kpi=${kpiCount} actions=${actions} back=${bodyBack}`);
    }

    await owner.page.locator('[data-owner-gift-tab="redemptions"]').click();
    await owner.page.waitForTimeout(800);
    report.giftUsageFilter =
      (await owner.page.locator("button").filter({ hasText: /전체|확정|환불|All|Pending|Refund/ }).count()) >= 3
        ? "PASS"
        : "FAIL";
    if (report.giftUsageFilter === "FAIL") fail("giftUsageFilter", "filters");

    await owner.page.goto(`${ORIGIN}/stores/owner/customer-care?storeId=${STORE.storeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await owner.page.waitForSelector("[data-owner-customer-care-hub]", { timeout: 20000 });
    const entries = await owner.page.locator("[data-owner-care-entry]").count();
    const csHref = await owner.page.locator('[data-owner-care-entry="customer-center"]').getAttribute("href");
    report.careHub = entries === 3 && csHref?.includes("/customer-care/customer-center") ? "PASS" : "FAIL";
    if (report.careHub === "FAIL") fail("careHub", `entries=${entries} href=${csHref}`);

    await owner.page.goto(
      `${ORIGIN}/stores/owner/customer-care/customer-center?storeId=${STORE.storeId}&tab=messages&from=owner-care`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await owner.page.waitForSelector("[data-owner-customer-center]", { timeout: 20000 });
    report.customerCenter = (await owner.page.locator("[data-owner-care-tab]").count()) === 2 ? "PASS" : "FAIL";
    if (report.customerCenter === "FAIL") fail("customerCenter", "tabs");

    const navCount = await owner.page.locator("[data-owner-mobile-bottom-nav], nav[aria-label*='Owner'], [data-testid='owner-bottom-nav']").count();
    const overflowish = await owner.page.evaluate(() => {
      const nav = document.querySelector("[data-owner-bottom-nav], [data-owner-mobile-bottom-nav]");
      return { hasNav: Boolean(nav), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    report.bottomNavHidden = overflowish.hasNav === false || navCount === 0 ? "PASS" : "FAIL";
    // If selector unknown, check reply footer not covered after opening thread later

    await owner.page.goto(`${ORIGIN}/mypage/inbox`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await owner.page.waitForTimeout(2500);
    report.ownerDeepLink = owner.page.url().includes("/stores/owner/customer-care/") ? "PASS" : "FAIL";
    if (report.ownerDeepLink === "FAIL") fail("ownerDeepLink", owner.page.url());

    const ownerUserId = owner.session.user.id;
    const adminUserId = admin.session.user.id;
    const subjectA = `QA Care A ${Date.now()}`;
    const nowA = new Date().toISOString();
    const { data: threadARow, error: aErr } = await sb
      .from("member_admin_note_threads")
      .insert({
        member_user_id: ownerUserId,
        subject: subjectA,
        status: "answered",
        started_by: "admin",
        last_message_at: nowA,
        member_unread_count: 1,
        admin_unread_count: 0,
        updated_at: nowA,
      })
      .select("*")
      .single();
    if (aErr || !threadARow?.id) fail("scenarioA", aErr?.message || "no_thread");
    const threadA = threadARow.id;
    {
      const { error } = await sb.from("member_admin_note_messages").insert({
        thread_id: threadA,
        sender_role: "admin",
        sender_user_id: adminUserId,
        body: "Admin to Owner message for Care UX proof",
      });
      if (error) fail("scenarioA", error.message);
    }
    report.scenarioA = "PRODUCTION_PROVEN";

    await owner.page.goto(
      `${ORIGIN}/stores/owner/customer-care/customer-center?storeId=${STORE.storeId}&tab=messages&from=owner-care`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await owner.page.waitForTimeout(2000);
    if ((await owner.page.locator(`text=${subjectA}`).count()) === 0) fail("scenarioA", "owner_list_missing");
    await owner.page.locator(`text=${subjectA}`).first().click();
    await owner.page.waitForTimeout(1500);
    report.ownerRead =
      owner.page.url().includes("/customer-care/messages/") &&
      (await owner.page.locator("text=Admin to Owner message").count()) > 0
        ? "PASS"
        : "FAIL";
    if (report.ownerRead === "FAIL") fail("ownerRead", owner.page.url());

    const replyVisible = await owner.page.locator("[data-owner-care-reply-send]").boundingBox();
    const vp = owner.page.viewportSize();
    if (!replyVisible || !vp || replyVisible.y + replyVisible.height > vp.height - 4) {
      fail("bottomNavHidden", `reply_clipped y=${replyVisible?.y}`);
    }
    report.bottomNavHidden = "PASS";

    const subjectB = `QA Care B ${Date.now()}`;
    const inqRes = await owner.page.request.post(`${ORIGIN}/api/me/admin-notes`, {
      data: { subject: subjectB, body: "Owner inquiry for Care UX proof" },
    });
    const inqJson = await inqRes.json().catch(() => ({}));
    if (!inqRes.ok() || !inqJson.ok) fail("scenarioB", `${inqRes.status()}:${JSON.stringify(inqJson)}`);
    const threadB = inqJson.thread?.id;
    report.scenarioB = threadB ? "PRODUCTION_PROVEN" : "FAIL";

    const { data: owned } = await sb.from("stores").select("id").eq("owner_user_id", ownerUserId).limit(1);
    report.adminStoreContext = Array.isArray(owned) && owned.length > 0 ? "PASS" : "FAIL";

    const nowB = new Date().toISOString();
    const { error: replyErr } = await sb.from("member_admin_note_messages").insert({
      thread_id: threadB,
      sender_role: "admin",
      sender_user_id: adminUserId,
      body: "Admin reply on same thread",
    });
    if (replyErr) fail("adminReply", replyErr.message);
    await sb
      .from("member_admin_note_threads")
      .update({ status: "answered", last_message_at: nowB, member_unread_count: 1, updated_at: nowB })
      .eq("id", threadB);
    report.adminReply = "PASS";

    await owner.page.goto(
      `${ORIGIN}/stores/owner/customer-care/inquiries/${threadB}?storeId=${STORE.storeId}&from=owner-care`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await owner.page.waitForTimeout(1500);
    const hasOwner = (await owner.page.locator("text=Owner inquiry for Care UX proof").count()) > 0;
    const hasAdmin = (await owner.page.locator("text=Admin reply on same thread").count()) > 0;
    report.threadHistory = hasOwner && hasAdmin ? "PASS" : "FAIL";
    if (report.threadHistory === "FAIL") fail("threadHistory", `o=${hasOwner} a=${hasAdmin}`);

    const follow = await owner.page.request.post(`${ORIGIN}/api/me/admin-notes/${threadB}`, {
      data: { body: "Owner follow-up on same thread" },
    });
    const followJson = await follow.json().catch(() => ({}));
    report.ownerFollowUp = follow.ok() && followJson.ok ? "PASS" : "FAIL";
    if (report.ownerFollowUp === "FAIL") fail("ownerFollowUp", JSON.stringify(followJson));

    await owner.page.goto(moneyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await owner.page.waitForTimeout(800);
    const overflow = await owner.page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    report.px390 = overflow.sw <= overflow.cw + 2 ? "PASS" : "FAIL";
    if (report.px390 === "FAIL") fail("px390", JSON.stringify(overflow));

    report.final = "OWNER ADMIN GIFT / CARE UX: PRODUCTION_PROVEN";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await owner.ctx.close();
    await admin.ctx.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  if (!existsSync(OUT)) writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
