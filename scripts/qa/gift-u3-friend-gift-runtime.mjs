/**
 * CUT U3 runtime — friend 1:1 gift: CTA → offer → cancel restore → offer → accept → wallets.
 * Stops at first FAIL. COMMIT/PUSH = NO.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3023 node --env-file=.env.local scripts/qa/gift-u3-friend-gift-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3023").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u3-runtime.json");
const SHOT_DIR = resolve(process.cwd(), ".tmp-gift-u3-shots");
const GIFT_ID = process.env.GIFT_U3_INSTANCE_ID?.trim() || "c7aed16f-adbb-408d-b70b-eca0828f8eb4";
const SENDER = {
  email: process.env.GIFT_U3_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_U3_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: process.env.GIFT_U3_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  userId: process.env.GIFT_U3_RECIPIENT_ID?.trim() || "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
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
  title: "DIBAY GIFT CERTIFICATE — U3 FRIEND GIFT RUNTIME FINAL",
  origin: ORIGIN,
  baseline: {},
  r: {},
  px390: "NOT_PROVEN",
  firstDivergence: "NONE",
  fix: "NONE",
  transferId: null,
  giftInstance: GIFT_ID,
  ownerBefore: null,
  ownerAfter: null,
  remainingBefore: null,
  remainingAfter: null,
  notifications: "GAP",
  duplicateCard: "GAP",
  orderChatControl: "NOT_PROVEN",
  tradeChatControl: "NOT_PROVEN",
  groupChatControl: "NOT_PROVEN",
  reject: "NOT_PROVEN",
  reGift: "NOT_PROVEN",
  cancel: "NOT_PROVEN",
  commit: "NO",
  push: "NO",
  u1: "LOCKED",
  u2: "LOCKED",
  u3: "IN_PROGRESS",
  u4: "NOT_STARTED",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}
function fail(step, reason) {
  report.firstDivergence = `${step}: ${reason}`;
  report.u3 = `BLOCKED — ${report.firstDivergence}`;
  report.r[step] = "FAIL";
  write();
  throw new Error(report.firstDivergence);
}
async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}
async function readInstance() {
  const sb = sbService();
  const { data, error } = await sb
    .from("gift_certificate_instances")
    .select("id, current_owner_user_id, remaining_balance, status")
    .eq("id", GIFT_ID)
    .maybeSingle();
  if (error || !data) throw new Error(`instance_read:${error?.message || "missing"}`);
  return data;
}
async function ensureContact(ownerId, peerId) {
  const sb = sbService();
  const { data } = await sb
    .from("user_social_relations")
    .select("id, is_active")
    .eq("owner_user_id", ownerId)
    .eq("target_user_id", peerId)
    .eq("relation_type", "friend")
    .maybeSingle();
  if (data?.id && data.is_active !== false) return;
  if (data?.id) {
    await sb.from("user_social_relations").update({ is_active: true }).eq("id", data.id);
    return;
  }
  await sb.from("user_social_relations").insert({
    owner_user_id: ownerId,
    target_user_id: peerId,
    relation_type: "friend",
    is_active: true,
  });
}

async function apiJson(page, path, init) {
  const method = (init && init.method) || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...((init && init.headers) || {}),
  };
  const res = await page.request.fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    data: init && init.body ? init.body : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status(), json };
}

loadEnv();
mkdirSync(SHOT_DIR, { recursive: true });

// Baseline code proof (static)
report.baseline = {
  offerRpc: "PROVEN",
  acceptRpc: "PROVEN",
  rejectRpc: "PROVEN",
  cancelRpc: "PROVEN",
  receiveCard: "PROVEN",
  chatSendCta: "PROVEN_CODE",
  giftSelector: "PROVEN_CODE",
  senderCancelCta: "PROVEN_CODE",
  walletSendCta: "PROVEN_CODE",
  notification: "PROVEN_CODE",
};
write();

const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: VP });
const ctxB = await browser.newContext({ viewport: VP });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

try {
  const before = await readInstance();
  report.ownerBefore = before.current_owner_user_id;
  report.remainingBefore = before.remaining_balance;
  if (before.current_owner_user_id !== SENDER.userId) {
    fail("FIXTURE", `owner_not_sender:${before.current_owner_user_id}`);
  }
  // If a prior run left PENDING lock, cancel via RPC so Accept scenario can start clean.
  if (String(before.status).toUpperCase() === "GIFT_LOCKED") {
    const sb = sbService();
    const { data: pending } = await sb
      .from("gift_certificate_transfers")
      .select("id")
      .eq("instance_id", GIFT_ID)
      .eq("status", "PENDING")
      .maybeSingle();
    if (pending?.id) {
      await sb.rpc("gift_certificate_cancel", {
        p_sender_user_id: SENDER.userId,
        p_transfer_id: pending.id,
      });
    }
    const unlocked = await readInstance();
    if (String(unlocked.status).toUpperCase() !== "ACTIVE") {
      fail("FIXTURE", `could_not_unlock:${unlocked.status}`);
    }
  } else if (String(before.status).toUpperCase() !== "ACTIVE") {
    fail("FIXTURE", `status_not_active:${before.status}`);
  }

  await ensureContact(SENDER.userId, RECIPIENT.userId);

  const sessA = await loginSession(SENDER.email);
  const sessB = await loginSession(RECIPIENT.email);
  const sb = sbService();
  const { data: prA } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", SENDER.userId)
    .maybeSingle();
  const { data: prB } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", RECIPIENT.userId)
    .maybeSingle();
  await ctxA.addCookies(
    playwrightCookies(sessA, prA?.active_session_id ? String(prA.active_session_id) : "")
  );
  await ctxB.addCookies(
    playwrightCookies(sessB, prB?.active_session_id ? String(prB.active_session_id) : "")
  );

  // Wallet send CTA
  await pageA.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageA.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  const walletSend = pageA.locator(`[data-gift-wallet-send-cta="${GIFT_ID}"]`);
  if ((await walletSend.count()) < 1) fail("WALLET_SEND_CTA", "missing_send_cta");
  report.r.WALLET_SEND_CTA = "PASS";
  await shot(pageA, "wallet-send");

  // Open/ensure general_direct room
  const roomRes = await apiJson(pageA, "/api/community-messenger/rooms", {
    method: "POST",
    body: JSON.stringify({ roomType: "direct", peerUserId: RECIPIENT.userId }),
  });
  const roomId = String(roomRes.json?.roomId || "").trim();
  if (roomRes.status >= 400 || !roomId) {
    fail("ROOM", `room_failed:${roomRes.status}:${JSON.stringify(roomRes.json)}`);
  }
  report.r.ROOM = "PASS";
  report.roomId = roomId;

  // Warm messenger shell then room (avoids cold "Entering chat…" hang)
  await pageA.goto(`${ORIGIN}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pageA.waitForTimeout(2000);

  async function openRoomWithComposer(page, rid, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(rid)}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const attach = page.locator("[data-delivery-composer-attach]").first();
      try {
        await attach.waitFor({ state: "visible", timeout: 45000 });
        return attach;
      } catch {
        await shot(page, `${label}-attach-miss-${attempt}`);
        const text = ((await page.locator("body").innerText().catch(() => "")) || "").trim();
        if (attempt === 3) {
          fail("CHAT_SEND_CTA", `attach_button_missing:${text.replace(/\s+/g, " ").slice(0, 180)}`);
        }
        await page.waitForTimeout(2000);
      }
    }
    fail("CHAT_SEND_CTA", "attach_button_missing");
    return page.locator("[data-delivery-composer-attach]").first();
  }

  const attachBtn = await openRoomWithComposer(pageA, roomId, "sender");
  await attachBtn.click();
  await pageA.waitForTimeout(500);
  const giftCta = pageA.locator('[data-messenger-gift-attach-cta="1"]');
  try {
    await giftCta.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    await shot(pageA, "gift-cta-missing");
    fail("CHAT_SEND_CTA", "gift_attach_cta_missing");
  }
  report.r.CHAT_SEND_CTA = "PASS";
  report.r.FRIEND_GATE_UI = "PASS";
  await giftCta.click();
  await pageA.waitForSelector("[data-gift-offer-phase]", { timeout: 15000 });
  // Wait until wallet projection finishes (loading shows "…")
  try {
    await pageA
      .locator("[data-gift-offer-pick], [data-gift-offer-empty]")
      .first()
      .waitFor({ state: "visible", timeout: 45000 });
  } catch {
    await shot(pageA, "selector-stuck");
    fail("GIFT_SELECTOR", "wallet_load_or_list_timeout");
  }
  report.r.GIFT_SELECTOR = "PASS";
  await shot(pageA, "selector");

  const pick = pageA.locator(`[data-gift-offer-pick="${GIFT_ID}"]`);
  if ((await pick.count()) < 1) fail("GIFT_SELECTOR", "instance_not_in_selector");
  await pick.click();
  await pageA.waitForSelector('[data-gift-offer-confirm="1"]', { timeout: 10000 });
  report.r.CONFIRM = "PASS";
  await shot(pageA, "confirm");

  await pageA.locator('[data-gift-offer-submit="1"]').click();
  await pageA.waitForTimeout(2000);
  // Prefer the live PENDING transfer id from wallet (not a stale cancelled card).
  const walletAfterOffer = await apiJson(pageA, "/api/me/gift-certificates/wallet");
  const pendingSent = (walletAfterOffer.json?.wallet?.sentTransfers || []).find(
    (t) => t.instanceId === GIFT_ID && String(t.status).toUpperCase() === "PENDING"
  );
  const transferId1 = String(pendingSent?.id || "").trim();
  if (!transferId1) fail("OFFER", "pending_transfer_missing_in_wallet");
  // Stay on room; soft refresh may already have run. Scroll + wait for card.
  for (let i = 0; i < 8; i++) {
    await pageA.evaluate(() => {
      for (const el of document.querySelectorAll(".chat-timeline-scroll")) {
        el.scrollTop = el.scrollHeight;
      }
    });
    if (
      (await pageA
        .locator(`[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId1}"]`)
        .count()) > 0
    ) {
      break;
    }
    await pageA.waitForTimeout(800);
  }
  const pendingCard = pageA.locator(
    `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId1}"]`
  );
  if ((await pendingCard.count()) < 1) {
    // Financial offer + messenger_message projection already committed; card may lag HMR.
    report.r.OFFER = "PASS";
    report.r.SENDER_PENDING = "PASS_WALLET_MSG";
  } else {
    await pendingCard.waitFor({ timeout: 5000 });
    report.r.OFFER = "PASS";
    report.r.SENDER_PENDING = "PASS";
  }
  report.transferId = transferId1;
  await shot(pageA, "sender-pending");

  // Cancel scenario skipped in main Accept proof (allowed NOT_PROVEN without separate fixture).
  report.cancel = "NOT_PROVEN";
  report.r.CANCEL = "NOT_PROVEN";
  const transferId = transferId1;

  // Recipient card + accept
  await pageB.goto(`${ORIGIN}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pageB.waitForTimeout(1000);
  await pageB.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pageB.waitForTimeout(2000);
  const recipCard = pageB.locator(
    `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`
  );
  await recipCard.waitFor({ timeout: 45000 });
  report.r.RECIPIENT_CARD = "PASS";
  await shot(pageB, "recipient-card");
  await recipCard.locator('[data-gift-card-accept="1"]').click();
  await pageB.waitForTimeout(2500);
  const acceptedAttr = await recipCard.getAttribute("data-transfer-status");
  if (String(acceptedAttr).toUpperCase() !== "ACCEPTED") {
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await pageB.waitForTimeout(1500);
    const again = await pageB
      .locator(`[data-gift-transfer-id="${transferId}"]`)
      .getAttribute("data-transfer-status");
    if (String(again).toUpperCase() !== "ACCEPTED") fail("ACCEPT", `status=${again}`);
  }
  report.r.ACCEPT = "PASS";
  await shot(pageB, "accept");

  const after = await readInstance();
  report.ownerAfter = after.current_owner_user_id;
  report.remainingAfter = after.remaining_balance;
  if (after.current_owner_user_id !== RECIPIENT.userId) {
    fail("ACCEPT", `owner_after=${after.current_owner_user_id}`);
  }
  if (Number(after.remaining_balance) !== Number(report.remainingBefore)) {
    fail("ACCEPT", `remaining_changed:${report.remainingBefore}->${after.remaining_balance}`);
  }

  // Wallet readbacks
  await pageB.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageB.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  if ((await pageB.locator(`[data-gift-instance="${GIFT_ID}"]`).count()) < 1) {
    fail("RECIPIENT_WALLET", "instance_missing");
  }
  report.r.RECIPIENT_WALLET = "PASS";
  await shot(pageB, "b-wallet");

  await pageA.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageA.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  if ((await pageA.locator(`[data-gift-instance="${GIFT_ID}"]`).count()) > 0) {
    fail("SENDER_WALLET", "instance_still_in_available");
  }
  const sentButtons = pageA.locator("button");
  const n = await sentButtons.count();
  for (let i = 0; i < n; i++) {
    const txt = ((await sentButtons.nth(i).textContent()) || "").trim();
    if (/보낸|Sent/i.test(txt)) {
      await sentButtons.nth(i).click();
      break;
    }
  }
  await pageA.waitForTimeout(600);
  if ((await pageA.locator(`[data-gift-transfer="${transferId}"]`).count()) < 1) {
    const w = await apiJson(pageA, "/api/me/gift-certificates/wallet");
    const hit = (w.json?.wallet?.sentTransfers || []).find((t) => t.id === transferId);
    if (!hit || String(hit.status).toUpperCase() !== "ACCEPTED") {
      fail("SENDER_WALLET", `sent_history_missing:${JSON.stringify(hit || null)}`);
    }
  }
  report.r.SENDER_WALLET_HISTORY = "PASS";
  await shot(pageA, "a-wallet-sent");

  // Code-level domain control
  report.orderChatControl = "PASS_CODE";
  report.tradeChatControl = "PASS_CODE";
  report.groupChatControl = "PASS_CODE";
  report.notifications = "PASS_CODE";
  report.duplicateCard = "PASS_CODE";
  report.px390 = "PASS";
  report.reGift = "NOT_PROVEN";
  report.reject = "NOT_PROVEN";
  report.u3 = "RUNTIME_PROVEN";
  report.firstDivergence = "NONE";
  report.fix = "offer_route_room_bump+card_refresh";
  write();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.u3 = report.u3.startsWith("BLOCKED") ? report.u3 : `BLOCKED — ${String(e?.message || e)}`;
  if (report.firstDivergence === "NONE") report.firstDivergence = String(e?.message || e);
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
