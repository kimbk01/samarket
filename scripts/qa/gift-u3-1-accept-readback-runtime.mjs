/**
 * U3.1 Accept UI readback — one tap, one POST, ACCEPTED survives remount.
 * Creates a fresh PENDING transfer via product offer API (no second accept POST).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3023 node --env-file=.env.local scripts/qa/gift-u3-1-accept-readback-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3023").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u3-1-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-u3-1-shots");
const PRODUCT_ID = process.env.GIFT_U31_PRODUCT_ID?.trim() || "2d49b295-3412-4289-a50d-2fb40ce0f745";
const SENDER = {
  email: "qqqq@manual.local",
  userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: "wwww@manual.local",
  userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
const VP = { width: 390, height: 844 };

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
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
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}`);
  return verified.session;
}
function cookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const list = [
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
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
  if (sessionId) {
    list.push({
      name: "samarket_active_session_id",
      value: sessionId,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return list;
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const report = {
  title: "DIBAY GIFT CERTIFICATE — U3.1 ACCEPT READBACK FINAL",
  acceptPostCount: null,
  secondAccept: "NONE",
  cardImmediate: null,
  cardAfterRerender: null,
  ownership: null,
  wallet: null,
  px390: null,
  fixture: {},
  cancel: "NOT_PROVEN",
  reject: "NOT_PROVEN",
  reGift: "NOT_PROVEN",
  commit: "NO",
  push: "NO",
  u1: "LOCKED",
  u2: "LOCKED",
  u3: "PARTIAL",
  u4: "NOT_STARTED",
  firstDivergence: "NONE",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: VP });
const ctxB = await browser.newContext({ viewport: VP });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

try {
  const sb = sbService();
  await sb.from("user_social_relations").upsert(
    {
      owner_user_id: SENDER.userId,
      target_user_id: RECIPIENT.userId,
      relation_type: "friend",
      is_active: true,
    },
    { onConflict: "owner_user_id,target_user_id,relation_type" }
  ).then(() => {}).catch(async () => {
    const { data } = await sb
      .from("user_social_relations")
      .select("id")
      .eq("owner_user_id", SENDER.userId)
      .eq("target_user_id", RECIPIENT.userId)
      .eq("relation_type", "friend")
      .maybeSingle();
    if (!data?.id) {
      await sb.from("user_social_relations").insert({
        owner_user_id: SENDER.userId,
        target_user_id: RECIPIENT.userId,
        relation_type: "friend",
        is_active: true,
      });
    }
  });

  const sessA = await loginSession(SENDER.email);
  const sessB = await loginSession(RECIPIENT.email);
  const { data: prA } = await sb.from("profiles").select("active_session_id, points").eq("id", SENDER.userId).maybeSingle();
  const { data: prB } = await sb.from("profiles").select("active_session_id").eq("id", RECIPIENT.userId).maybeSingle();
  await ctxA.addCookies(cookies(sessA, prA?.active_session_id ? String(prA.active_session_id) : ""));
  await ctxB.addCookies(cookies(sessB, prB?.active_session_id ? String(prB.active_session_id) : ""));

  // Prefer any existing PENDING transfer between actors (GIFT_LOCKED while pending).
  let instanceId = "";
  let transferId = "";
  let roomId = "";
  const { data: existingPending } = await sb
    .from("gift_certificate_transfers")
    .select("id, room_id, status, instance_id")
    .eq("sender_user_id", SENDER.userId)
    .eq("recipient_user_id", RECIPIENT.userId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPending?.id) {
    transferId = existingPending.id;
    roomId = String(existingPending.room_id || "").trim();
    instanceId = String(existingPending.instance_id || "").trim();
  }

  if (!instanceId) {
    const { data: owned } = await sb
      .from("gift_certificate_instances")
      .select("id, status, remaining_balance")
      .eq("current_owner_user_id", SENDER.userId)
      .in("status", ["ACTIVE", "PARTIALLY_REDEEMED"])
      .gt("remaining_balance", 0)
      .order("created_at", { ascending: false })
      .limit(5);
    const free = (owned || []).find((r) => String(r.status).toUpperCase() === "ACTIVE");
    if (free?.id) {
      instanceId = free.id;
    } else {
      const purchase = await pageA.request.fetch(`${ORIGIN}/api/me/gift-certificates/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          productId: PRODUCT_ID,
          idempotencyKey: `u31-${Date.now()}`,
        }),
      });
      const pj = await purchase.json();
      instanceId = String(pj.instance_id || pj.instanceId || pj.wallet_instance_id || "").trim();
      if (!purchase.ok() || !instanceId) {
        throw new Error(`no_offerable_gift:purchase=${purchase.status()}:${JSON.stringify(pj)}`);
      }
    }
  }
  report.fixture.instanceId = instanceId;

  if (!roomId) {
    const roomRes = await pageA.request.fetch(`${ORIGIN}/api/community-messenger/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ roomType: "direct", peerUserId: RECIPIENT.userId }),
    });
    const roomJson = await roomRes.json();
    roomId = String(roomJson.roomId || "").trim();
    if (!roomRes.ok() || !roomId) throw new Error(`room_failed:${roomRes.status()}`);
  }
  report.fixture.roomId = roomId;

  if (!transferId) {
    const offerRes = await pageA.request.fetch(`${ORIGIN}/api/me/gift-certificates/transfers/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        instanceId,
        recipientUserId: RECIPIENT.userId,
        roomId,
        idempotencyKey: `u31-offer-${Date.now()}`,
      }),
    });
    const offerJson = await offerRes.json();
    transferId = String(offerJson.transfer_id || offerJson.id || "").trim();
    if (!offerRes.ok() || !offerJson.ok || !transferId) {
      throw new Error(`offer_failed:${offerRes.status()}:${JSON.stringify(offerJson)}`);
    }
  }
  report.fixture.transferId = transferId;

  const { data: before } = await sb
    .from("gift_certificate_instances")
    .select("current_owner_user_id, remaining_balance, status")
    .eq("id", instanceId)
    .maybeSingle();
  report.fixture.ownerBefore = before?.current_owner_user_id;
  report.fixture.remainingBefore = before?.remaining_balance;

  await pageB.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  // Room ready: card or cm-room shell (composer attach can lag).
  for (let i = 0; i < 40; i++) {
    const hasRoom = (await pageB.locator("[data-cm-room]").count()) > 0;
    const hasAttach = (await pageB.locator("[data-delivery-composer-attach]").count()) > 0;
    if (hasRoom || hasAttach) break;
    await pageB.waitForTimeout(500);
  }

  const cardSel = `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`;
  for (let i = 0; i < 10; i++) {
    await pageB.evaluate(() => {
      for (const el of document.querySelectorAll(".chat-timeline-scroll")) el.scrollTop = el.scrollHeight;
    });
    if ((await pageB.locator(cardSel).count()) > 0) break;
    await pageB.waitForTimeout(800);
  }
  const card = pageB.locator(cardSel);
  await card.waitFor({ timeout: 20000 });
  report.acceptCta = "PASS";
  await pageB.screenshot({ path: resolve(SHOT, "r2-pending.png"), fullPage: true });

  const acceptPosts = [];
  const acceptResponses = [];
  pageB.on("request", (req) => {
    if (req.method() === "POST" && /\/transfers\/[^/]+\/accept(?:\?|$)/.test(req.url())) {
      acceptPosts.push(req.url());
    }
  });
  pageB.on("response", async (res) => {
    if (res.request().method() === "POST" && /\/transfers\/[^/]+\/accept(?:\?|$)/.test(res.url())) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        body = "";
      }
      acceptResponses.push({ status: res.status(), body });
    }
  });

  pageB.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors = [...(report.consoleErrors || []), msg.text().slice(0, 200)];
  });
  pageB.on("pageerror", (e) => {
    report.pageErrors = [...(report.pageErrors || []), String(e).slice(0, 200)];
  });

  const acceptBtn = card.locator('[data-gift-card-accept="1"]');
  await acceptBtn.waitFor({ state: "visible", timeout: 10000 });
  await acceptBtn.scrollIntoViewIfNeeded();
  const acceptWait = pageB.waitForResponse(
    (res) => res.request().method() === "POST" && /\/transfers\/[^/]+\/accept/.test(res.url()),
    { timeout: 20000 }
  );
  // force:true bypasses timeline overlay interceptors; still fires React onClick
  await acceptBtn.click({ force: true });
  try {
    await acceptWait;
  } catch {
    /* continue — count/status below are authoritative */
  }
  await pageB.waitForTimeout(1200);
  report.acceptPostCount = acceptPosts.length || acceptResponses.length;
  report.acceptResponses = acceptResponses;
  const stImm = await card.getAttribute("data-transfer-status");
  if (String(stImm).toUpperCase() !== "ACCEPTED") {
    await pageB.screenshot({ path: resolve(SHOT, "r5-fail.png"), fullPage: true });
    throw new Error(
      `CARD IMMEDIATE=${stImm}; posts=${report.acceptPostCount}; responses=${JSON.stringify(acceptResponses)}; console=${JSON.stringify(report.consoleErrors || [])}; page=${JSON.stringify(report.pageErrors || [])}`
    );
  }
  if ((report.acceptPostCount || 0) !== 1) {
    report.secondAccept = (report.acceptPostCount || 0) > 1 ? "OCCURRED" : "NONE";
    throw new Error(`ACCEPT POST COUNT=${report.acceptPostCount}`);
  }
  report.secondAccept = "NONE";
  report.cardImmediate = "ACCEPTED";
  await pageB.screenshot({ path: resolve(SHOT, "r5-accepted.png"), fullPage: true });

  // Same-session remount: scroll recycle, then leave/return.
  // sessionStorage-backed UI status must keep ACCEPTED over stale PENDING metadata.
  await pageB.evaluate(() => {
    for (const el of document.querySelectorAll(".chat-timeline-scroll")) el.scrollTop = 0;
  });
  await pageB.waitForTimeout(350);
  await pageB.evaluate(() => {
    for (const el of document.querySelectorAll(".chat-timeline-scroll")) el.scrollTop = el.scrollHeight;
  });
  await pageB.waitForTimeout(350);
  let stScroll = await card.getAttribute("data-transfer-status");
  if (String(stScroll).toUpperCase() !== "ACCEPTED") {
    throw new Error(`CARD AFTER SCROLL REMOUNT=${stScroll}`);
  }

  async function openRoomAndFindCard() {
    await pageB.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    // Prefer card / room shell — composer attach can lag behind timeline hydration.
    for (let i = 0; i < 40; i++) {
      await pageB.evaluate(() => {
        for (const el of document.querySelectorAll(".chat-timeline-scroll")) el.scrollTop = el.scrollHeight;
      });
      if ((await pageB.locator(cardSel).count()) > 0) return;
      if ((await pageB.locator("[data-cm-room]").count()) > 0 && i > 5) {
        /* room mounted; keep waiting for card */
      }
      await pageB.waitForTimeout(500);
    }
    throw new Error("card_missing_after_room_nav");
  }

  await pageB.goto(`${ORIGIN}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageB.waitForTimeout(500);
  await openRoomAndFindCard();
  const afterCard = pageB.locator(cardSel);
  await afterCard.waitFor({ timeout: 20000 });
  const st2 = await afterCard.getAttribute("data-transfer-status");
  if (String(st2).toUpperCase() !== "ACCEPTED") {
    await pageB.screenshot({ path: resolve(SHOT, "r7-fail.png"), fullPage: true });
    throw new Error(`CARD AFTER RERENDER=${st2}`);
  }
  report.cardAfterRerender = "ACCEPTED";

  if ((await pageB.locator(`${cardSel} [data-gift-card-accept="1"]`).count()) > 0) {
    throw new Error("accept_cta_visible_after_accepted");
  }
  if ((await pageB.locator(`${cardSel} [data-gift-card-wallet-cta="1"]`).count()) < 1) {
    throw new Error("wallet_cta_missing");
  }
  await pageB.screenshot({ path: resolve(SHOT, "r7-after-rerender.png"), fullPage: true });
  report.px390 = "PASS";

  const { data: after } = await sb
    .from("gift_certificate_instances")
    .select("current_owner_user_id, remaining_balance")
    .eq("id", instanceId)
    .maybeSingle();
  if (after?.current_owner_user_id !== RECIPIENT.userId) {
    throw new Error(`ownership=${after?.current_owner_user_id}`);
  }
  if (Number(after?.remaining_balance) !== Number(before?.remaining_balance)) {
    throw new Error("remaining_changed");
  }
  report.ownership = "A→B";

  await pageB.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded" });
  await pageB.waitForSelector('[data-wallet-ready="1"]', { timeout: 30000 });
  if ((await pageB.locator(`[data-gift-instance="${instanceId}"]`).count()) < 1) {
    throw new Error("wallet_missing_instance");
  }
  report.wallet = "PASS";

  report.u3 = "LOCKED";
  report.firstDivergence = "NONE";
  write();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.firstDivergence = String(e?.message || e);
  report.u3 = `PARTIAL — ${report.firstDivergence}`;
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
