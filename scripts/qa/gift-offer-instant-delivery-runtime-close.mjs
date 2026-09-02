/**
 * Gift offer instant delivery — Production/local runtime close (two-side, no refresh PASS).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3023 node --env-file=.env.local scripts/qa/gift-offer-instant-delivery-runtime-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3023").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/gift-offer-instant-delivery-runtime-close.json");
const SHOT = resolve(process.cwd(), "docs/perf/gift-offer-instant-delivery-shots");
const GIFT_ID = process.env.GIFT_INSTANT_INSTANCE_ID?.trim() || "c7aed16f-adbb-408d-b70b-eca0828f8eb4";
const SENDER = {
  email: process.env.GIFT_INSTANT_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_INSTANT_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: process.env.GIFT_INSTANT_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  userId: process.env.GIFT_INSTANT_RECIPIENT_ID?.trim() || "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
const VP = { width: 390, height: 844 };

const ROOM_ENTRY_ONLY = process.env.GIFT_ROOM_ENTRY_ONLY === "1";

const report = {
  origin: ORIGIN,
  giftInstanceId: GIFT_ID,
  roomEntryOnly: ROOM_ENTRY_ONLY,
  auth: "NOT_PROVEN",
  roomResolve: "NOT_PROVEN",
  roomType: "NOT_PROVEN",
  roomShell: "NOT_PROVEN",
  composer: "NOT_PROVEN",
  giftAttach: "NOT_PROVEN",
  roomId: null,
  webSenderImmediate: "NOT_PROVEN",
  webReceiverImmediate: "NOT_PROVEN",
  messageIdSame: "NOT_PROVEN",
  duplicate: "NOT_PROVEN",
  pendingAccept: "NOT_PROVEN",
  messengerNumber: "NOT_PROVEN",
  walletNumber: "NOT_PROVEN",
  detailNumber: "NOT_PROVEN",
  publicNumberSample: null,
  messageId: null,
  transferId: null,
  offerHttpStatus: null,
  offerResponseKeys: null,
  shots: {},
  firstFail: null,
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

function writeReport() {
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(key, reason) {
  report.firstFail = `${key}:${reason}`;
  writeReport();
  throw new Error(report.firstFail);
}

async function shot(page, name) {
  mkdirSync(SHOT, { recursive: true });
  const p = resolve(SHOT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  report.shots[name] = p;
}

async function readInstance() {
  const sb = sbService();
  const { data, error } = await sb
    .from("gift_certificate_instances")
    .select("id, current_owner_user_id, remaining_balance, status, public_gift_number")
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

async function unlockPendingIfLocked() {
  const inst = await readInstance();
  if (String(inst.status).toUpperCase() !== "GIFT_LOCKED") return inst;
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
  return readInstance();
}

async function captureRoomDom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const count = (s) => document.querySelectorAll(s).length;
    const visible = (el) => {
      if (!el) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const attach = q("[data-delivery-composer-attach]");
    return {
      url: location.href,
      path: location.pathname,
      body: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 240),
      counts: {
        attach: count("[data-delivery-composer-attach]"),
        composerRow: count("[data-delivery-composer-row]"),
        cmRoom: count("[data-cm-room]"),
        roomId: count("[data-cm-room-id]"),
        entryPass: count("[data-cm-room-entry-pass]"),
        entryEmpty: count("[data-cm-room-entry-empty]"),
        password: count('input[type="password"]'),
      },
      visible: {
        attach: visible(attach),
        composerRow: visible(q("[data-delivery-composer-row]")),
        cmRoom: visible(q("[data-cm-room]")),
      },
      roomIdAttr: q("[data-cm-room-id]")?.getAttribute("data-cm-room-id") || null,
      attachDisabled: attach ? attach.disabled : null,
    };
  });
}

/**
 * Canonical room entry: auth already on context → room URL → shell → composer → gift attach CTA.
 * Attach alone is not treated as room-ready; each stage fails with DOM evidence.
 */
async function openRoom(page, roomId, label) {
  const target = `${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
  const finalUrl = page.url();
  if (/\/login|\/signin|\/auth/i.test(finalUrl) || finalUrl.includes("redirect=")) {
    const dom = await captureRoomDom(page).catch(() => null);
    await shot(page, `${label}-auth-redirect`);
    fail("AUTH", `redirect_after_room_goto:${finalUrl}:dom=${JSON.stringify(dom)}`);
  }

  try {
    await page.locator(`[data-cm-room-id="${roomId}"]`).first().waitFor({ state: "attached", timeout: 45000 });
  } catch (e) {
    const dom = await captureRoomDom(page).catch(() => null);
    await shot(page, `${label}-shell-miss`);
    fail("ROOM_SHELL", `room_id_marker_missing:${String(e?.message || e).slice(0, 120)}:dom=${JSON.stringify(dom)}`);
  }
  report.roomShell = "PASS";

  try {
    await page.locator("[data-delivery-composer-row]").first().waitFor({ state: "visible", timeout: 30000 });
  } catch (e) {
    const dom = await captureRoomDom(page).catch(() => null);
    await shot(page, `${label}-composer-miss`);
    fail("COMPOSER", `composer_row_missing:${String(e?.message || e).slice(0, 120)}:dom=${JSON.stringify(dom)}`);
  }
  report.composer = "PASS";

  try {
    // Product canonical gift attach entry (MessengerComposerSector).
    await page.locator("[data-delivery-composer-attach]").first().waitFor({ state: "visible", timeout: 15000 });
  } catch (e) {
    const dom = await captureRoomDom(page).catch(() => null);
    await shot(page, `${label}-attach-miss`);
    fail("GIFT_ATTACH", `attach_not_visible:${String(e?.message || e).slice(0, 120)}:dom=${JSON.stringify(dom)}`);
  }
  report.giftAttach = "PASS";
}

function cardLocator(page, transferId) {
  return page.locator(`[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`);
}

async function countCards(page, transferId) {
  return cardLocator(page, transferId).count();
}

async function assertVisualNumber(page, label) {
  const card = page.locator('[data-gift-visual-card="1"]').first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const pub = await page.locator('[data-gift-public-number="1"]').first().textContent().catch(() => "");
  const text = (pub || "").trim();
  report.publicNumberSample = text || report.publicNumberSample;
  if (!text || text.includes("…")) fail(label, `number_missing_or_ellipsis:${text}`);
  if (text.length < 8) fail(label, `number_too_short:${text}`);
  await shot(page, label);
  return "PASS";
}

loadEnv();
writeReport();

async function main() {
const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: VP });
const ctxB = await browser.newContext({ viewport: VP });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

let offerCapture = { messageId: "", transferId: "" };

try {
  if (!ROOM_ENTRY_ONLY) {
    const inst = await unlockPendingIfLocked();
    report.publicNumberSample = String(inst.public_gift_number || "").trim() || null;
    if (inst.current_owner_user_id !== SENDER.userId) {
      fail("FIXTURE", `owner_not_sender:${inst.current_owner_user_id}`);
    }
    if (String(inst.status).toUpperCase() !== "ACTIVE" && String(inst.status).toUpperCase() !== "PARTIALLY_REDEEMED") {
      fail("FIXTURE", `status:${inst.status}`);
    }
  }

  await ensureContact(SENDER.userId, RECIPIENT.userId);

  const sessA = await loginSession(SENDER.email);
  const sessB = await loginSession(RECIPIENT.email);
  if (String(sessA.user?.id || "") !== SENDER.userId) {
    fail("AUTH", `sender_session_user_mismatch:${sessA.user?.id}`);
  }
  if (String(sessB.user?.id || "") !== RECIPIENT.userId) {
    fail("AUTH", `recipient_session_user_mismatch:${sessB.user?.id}`);
  }
  const sb = sbService();
  const { data: prA } = await sb.from("profiles").select("active_session_id").eq("id", SENDER.userId).maybeSingle();
  const { data: prB } = await sb.from("profiles").select("active_session_id").eq("id", RECIPIENT.userId).maybeSingle();
  await ctxA.addCookies(playwrightCookies(sessA, prA?.active_session_id ? String(prA.active_session_id) : ""));
  await ctxB.addCookies(playwrightCookies(sessB, prB?.active_session_id ? String(prB.active_session_id) : ""));

  const sessCheck = await pageA.request.get(`${ORIGIN}/api/auth/session`);
  const sessCheckJson = await sessCheck.json().catch(() => ({}));
  if (!sessCheck.ok() || sessCheckJson?.authenticated !== true) {
    fail("AUTH", `session_api_not_ready:${sessCheck.status()}:${JSON.stringify(sessCheckJson).slice(0, 200)}`);
  }
  report.auth = "PASS";

  const roomRes = await pageA.request.post(`${ORIGIN}/api/community-messenger/rooms`, {
    data: { roomType: "direct", peerUserId: RECIPIENT.userId },
    headers: { "Content-Type": "application/json" },
  });
  const roomJson = await roomRes.json().catch(() => ({}));
  const roomId = String(roomJson?.roomId || "").trim();
  if (!roomId) fail("ROOM", JSON.stringify(roomJson));
  const resolvedType = String(roomJson?.snapshot?.room?.roomType || "").trim();
  const viewerId = String(roomJson?.snapshot?.viewerUserId || "").trim();
  if (resolvedType !== "direct") {
    fail("ROOM_TYPE", `expected_direct_got:${resolvedType || "missing"}`);
  }
  if (viewerId && viewerId !== SENDER.userId) {
    fail("AUTH", `room_viewer_mismatch:${viewerId}`);
  }
  report.roomResolve = "PASS";
  report.roomType = "FRIEND_1_TO_1";
  report.roomId = roomId;

  await openRoom(pageA, roomId, "sender");
  await openRoom(pageB, roomId, "recipient");

  if (ROOM_ENTRY_ONLY) {
    writeReport();
    console.log(JSON.stringify({ ...report, final: "ROOM_ENTRY_PASS" }, null, 2));
    return;
  }

  await pageA.locator("[data-delivery-composer-attach]").first().click();
  await pageA.locator('[data-messenger-gift-attach-cta="1"]').waitFor({ state: "visible", timeout: 15000 });
  await pageA.locator('[data-messenger-gift-attach-cta="1"]').click();
  await pageA.waitForSelector("[data-gift-offer-phase]", { timeout: 20000 });
  await pageA.locator(`[data-gift-offer-pick="${GIFT_ID}"]`).click();
  await pageA.waitForSelector('[data-gift-offer-confirm="1"]', { timeout: 15000 });
  const t0 = Date.now();
  /** Await the single offer POST — fire-and-forget page.on('response') raced bump-delayed JSON. */
  const offerResponsePromise = pageA.waitForResponse(
    (res) =>
      res.url().includes("/api/me/gift-certificates/transfers/offer") &&
      res.request().method() === "POST",
    { timeout: 30000 }
  );
  await pageA.locator('[data-gift-offer-submit="1"]').click();
  const offerRes = await offerResponsePromise;
  report.offerHttpStatus = offerRes.status();
  let offerJson = null;
  try {
    offerJson = await offerRes.json();
  } catch (e) {
    fail("OFFER", `response_json_unreadable:${String(e?.message || e)}`);
  }
  report.offerResponseKeys = offerJson && typeof offerJson === "object" ? Object.keys(offerJson).sort() : [];
  if (!offerRes.ok() || !offerJson?.ok) {
    fail(
      "OFFER",
      `http=${offerRes.status()} ok=${offerJson?.ok} error=${offerJson?.error || "none"} keys=${(report.offerResponseKeys || []).join(",")}`
    );
  }
  const transferId = String(offerJson?.transfer?.id ?? "").trim();
  const messageId = String(offerJson?.message?.id ?? "").trim();
  if (!transferId) fail("OFFER", `no_transfer_id_from_api:keys=${(report.offerResponseKeys || []).join(",")}`);
  if (!messageId) fail("OFFER", `no_message_id_from_api:keys=${(report.offerResponseKeys || []).join(",")}`);
  offerCapture.transferId = transferId;
  offerCapture.messageId = messageId;

  report.transferId = transferId;
  report.messageId = messageId;

  let senderSeenMs = null;
  for (let i = 0; i < 25; i++) {
    if ((await countCards(pageA, transferId)) >= 1) {
      senderSeenMs = Date.now() - t0;
      break;
    }
    await pageA.waitForTimeout(200);
  }
  if (senderSeenMs == null || senderSeenMs > 5000) {
    fail("WEB_SENDER_IMMEDIATE", `sender_card_ms=${senderSeenMs}`);
  }
  report.webSenderImmediate = "PASS";
  await shot(pageA, "sender-immediate");

  const pendingSender = await cardLocator(pageA, transferId).getAttribute("data-transfer-status");
  if (String(pendingSender).toUpperCase() !== "PENDING") {
    fail("PENDING", `sender_status=${pendingSender}`);
  }

  let receiverSeenMs = null;
  for (let i = 0; i < 30; i++) {
    if ((await countCards(pageB, transferId)) >= 1) {
      receiverSeenMs = Date.now() - t0;
      break;
    }
    await pageB.waitForTimeout(200);
  }
  if (receiverSeenMs == null || receiverSeenMs > 8000) {
    fail("WEB_RECEIVER_IMMEDIATE", `receiver_card_ms=${receiverSeenMs}`);
  }
  report.webReceiverImmediate = "PASS";
  await shot(pageB, "receiver-immediate");

  const sbMsg = await sb
    .from("gift_certificate_transfers")
    .select("messenger_message_id")
    .eq("id", transferId)
    .maybeSingle();
  const dbMessageId = String(sbMsg.data?.messenger_message_id || "").trim();
  if (!dbMessageId) fail("MESSAGE_ID", "db_messenger_message_id_missing");
  if (offerCapture.messageId && offerCapture.messageId !== dbMessageId) {
    fail("MESSAGE_ID", `api=${offerCapture.messageId} db=${dbMessageId}`);
  }
  report.messageId = dbMessageId;
  report.messageIdSame = "PASS";

  if ((await countCards(pageA, transferId)) !== 1) fail("DUPLICATE", `sender_count=${await countCards(pageA, transferId)}`);
  if ((await countCards(pageB, transferId)) !== 1) fail("DUPLICATE", `receiver_count=${await countCards(pageB, transferId)}`);
  await pageA.waitForTimeout(1500);
  if ((await countCards(pageA, transferId)) !== 1) fail("DUPLICATE", "sender_after_echo");
  if ((await countCards(pageB, transferId)) !== 1) fail("DUPLICATE", "receiver_after_echo");
  report.duplicate = "PASS";

  report.messengerNumber = await assertVisualNumber(pageB, "messenger-number");

  await pageB.locator(`[data-gift-transfer-id="${transferId}"] [data-gift-card-accept="1"]`).click();
  await pageB.waitForTimeout(2500);
  const acceptedB = await cardLocator(pageB, transferId).getAttribute("data-transfer-status");
  const acceptedA = await cardLocator(pageA, transferId).getAttribute("data-transfer-status");
  if (String(acceptedB).toUpperCase() !== "ACCEPTED") fail("ACCEPT", `recipient=${acceptedB}`);
  if (String(acceptedA).toUpperCase() !== "ACCEPTED") fail("ACCEPT", `sender=${acceptedA}`);
  report.pendingAccept = "PASS";
  await shot(pageB, "accepted");

  await pageB.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageB.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', { timeout: 30000 });
  if ((await pageB.locator(`[data-gift-instance="${GIFT_ID}"]`).count()) < 1) {
    fail("WALLET", "instance_missing_after_accept");
  }
  report.walletNumber = await assertVisualNumber(pageB, "wallet-number");

  await pageB.locator(`[data-gift-instance="${GIFT_ID}"]`).first().click();
  await pageB.waitForTimeout(1500);
  report.detailNumber = await assertVisualNumber(pageB, "detail-number");

  writeReport();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  writeReport();
  console.error(String(e?.message || e));
  process.exitCode = 1;
} finally {
  await browser.close();
}
}

await main();
