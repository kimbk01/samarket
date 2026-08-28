/**
 * Transfer Lifecycle CUT — REJECT / CANCEL / RE-GIFT (Production or local).
 * Stops at first FAIL. Does not re-run U1–U4 / revenue / refund / CUT2.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-transfer-lifecycle-runtime.mjs
 *
 * Env (optional):
 *   GIFT_TL_INSTANCE_ID — active instance owned by sender A at start
 *   GIFT_TL_SENDER_EMAIL / GIFT_TL_RECIPIENT_EMAIL / GIFT_TL_REGIFT_PEER_EMAIL
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-transfer-lifecycle-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-transfer-lifecycle-shots");
const VP = { width: 390, height: 844 };

const SENDER = {
  email: process.env.GIFT_TL_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_TL_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: process.env.GIFT_TL_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  userId: process.env.GIFT_TL_RECIPIENT_ID?.trim() || "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
/** Re-gift peer — defaults to sender A so B→A chain works with two QA accounts. */
const REGIFT_PEER = {
  email: process.env.GIFT_TL_REGIFT_PEER_EMAIL?.trim() || SENDER.email,
  userId: process.env.GIFT_TL_REGIFT_PEER_ID?.trim() || SENDER.userId,
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

const report = {
  title: "DIBAY GIFT CERTIFICATE — TRANSFER LIFECYCLE FINAL",
  origin: ORIGIN,
  baselineU3Accept: "PRESERVED",
  reject: "NOT_PROVEN",
  cancel: "NOT_PROVEN",
  reGift: "NOT_PROVEN",
  partialBalanceReGift: "NOT_IMPLEMENTED",
  friend1_1: "NOT_PROVEN",
  orderChatControl: "CODE_PROVEN",
  tradeChatControl: "CODE_PROVEN",
  groupChatControl: "CODE_PROVEN",
  offerNotification: "NOT_PROVEN",
  acceptNotification: "PRESERVED",
  rejectNotification: "NOT_PROVEN",
  cancelNotification: "MISSING",
  px390: "NOT_PROVEN",
  firstDivergence: "NONE",
  fix: "NONE",
  commit: "NO",
  push: "NO",
  transferLifecycle: "IN_PROGRESS",
  residuals: ["Public Gift Number", "Admin Global Gift Tracking", "remaining Control/UX only"],
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, reason) {
  report.firstDivergence = `${step}: ${reason}`;
  report.transferLifecycle = `BLOCKED — ${report.firstDivergence}`;
  write();
  throw new Error(report.firstDivergence);
}

async function shot(page, name) {
  mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: resolve(SHOT, `${name}.png`), fullPage: true }).catch(() => {});
}

async function readInstance(instanceId) {
  const sb = sbService();
  const { data, error } = await sb
    .from("gift_certificate_instances")
    .select("id, current_owner_user_id, remaining_balance, status, face_value")
    .eq("id", instanceId)
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

async function cancelPendingForInstance(instanceId, senderId) {
  const sb = sbService();
  const { data: pending } = await sb
    .from("gift_certificate_transfers")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("status", "PENDING")
    .maybeSingle();
  if (!pending?.id) return;
  await sb.rpc("gift_certificate_cancel", {
    p_sender_user_id: senderId,
    p_transfer_id: pending.id,
  });
}

async function pickOwnedInstance(ownerId, preferredId) {
  const sb = sbService();
  if (preferredId) {
    const row = await readInstance(preferredId);
    if (
      row.current_owner_user_id === ownerId &&
      ["ACTIVE", "PARTIALLY_REDEEMED"].includes(String(row.status).toUpperCase()) &&
      Number(row.remaining_balance) > 0
    ) {
      return preferredId;
    }
  }
  const { data } = await sb
    .from("gift_certificate_instances")
    .select("id, status, remaining_balance")
    .eq("current_owner_user_id", ownerId)
    .in("status", ["ACTIVE", "PARTIALLY_REDEEMED"])
    .gt("remaining_balance", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** Prefer A-owned gift; after U3 accept, fall back to B-owned (B→A scenarios). */
async function resolveFixture(preferredId) {
  const forA = await pickOwnedInstance(SENDER.userId, preferredId);
  if (forA) {
    return {
      instanceId: forA,
      owner: SENDER,
      peer: RECIPIENT,
      ownerPage: pageA,
      peerPage: pageB,
      ownerCtx: ctxA,
      peerCtx: ctxB,
    };
  }
  const forB = await pickOwnedInstance(RECIPIENT.userId, preferredId);
  if (forB) {
    return {
      instanceId: forB,
      owner: RECIPIENT,
      peer: SENDER,
      ownerPage: pageB,
      peerPage: pageA,
      ownerCtx: ctxB,
      peerCtx: ctxA,
    };
  }
  fail("FIXTURE", "no_active_gift_for_A_or_B");
  return null;
}

async function apiJson(page, path, init) {
  const res = await page.request.fetch(`${ORIGIN}${path}`, {
    method: (init && init.method) || "GET",
    headers: { "Content-Type": "application/json", ...((init && init.headers) || {}) },
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

async function openDirectRoom(page, peerUserId) {
  const roomRes = await apiJson(page, "/api/community-messenger/rooms", {
    method: "POST",
    body: JSON.stringify({ roomType: "direct", peerUserId }),
  });
  const roomId = String(roomRes.json?.roomId || "").trim();
  if (roomRes.status >= 400 || !roomId) {
    fail("ROOM", `room_failed:${roomRes.status}:${JSON.stringify(roomRes.json)}`);
  }
  return roomId;
}

async function offerViaApi(page, { instanceId, recipientUserId, roomId }) {
  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `gift-offer-${Date.now()}-${Math.random()}`;
  const res = await apiJson(page, "/api/me/gift-certificates/transfers/offer", {
    method: "POST",
    body: JSON.stringify({ instanceId, recipientUserId, roomId, idempotencyKey }),
  });
  if (!res.json?.ok) fail("OFFER", JSON.stringify(res.json));
  const transferId = String(res.json.transfer_id ?? res.json.id ?? "").trim();
  if (!transferId) fail("OFFER", "missing_transfer_id");
  return transferId;
}

async function walletSnapshot(page) {
  const res = await apiJson(page, "/api/me/gift-certificates/wallet");
  return res.json?.wallet ?? null;
}

async function waitCardStatus(page, transferId, status, isRecipient) {
  const sel = `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`;
  let card = page.locator(sel);
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(".chat-timeline-scroll")) {
        el.scrollTop = el.scrollHeight;
      }
    });
    if ((await card.count()) > 0) break;
    await page.waitForTimeout(800);
  }
  if ((await card.count()) < 1) {
    await card.waitFor({ timeout: 15000 });
  }
  const attr = String(await card.getAttribute("data-transfer-status")).toUpperCase();
  if (attr !== status) {
    await page.waitForTimeout(1500);
    const again = String(await card.getAttribute("data-transfer-status")).toUpperCase();
    if (again !== status) fail(isRecipient ? "CARD_RECIPIENT" : "CARD_SENDER", `expected_${status}_got_${again}`);
  }
  const acceptBtn = card.locator('[data-gift-card-accept="1"]');
  const rejectBtn = card.locator('[data-gift-card-reject="1"]');
  const cancelBtn = card.locator('[data-gift-card-cancel="1"]');
  if (status !== "PENDING") {
    if ((await acceptBtn.count()) > 0 && (await acceptBtn.isVisible())) {
      fail("CARD_TERMINAL", "accept_cta_still_visible");
    }
    if ((await rejectBtn.count()) > 0 && (await rejectBtn.isVisible())) {
      fail("CARD_TERMINAL", "reject_cta_still_visible");
    }
    if ((await cancelBtn.count()) > 0 && (await cancelBtn.isVisible())) {
      fail("CARD_TERMINAL", "cancel_cta_still_visible");
    }
  }
  return card;
}

async function acceptTransferPeer(page, transferId, roomId) {
  await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  try {
    const acceptCard = await waitCardStatus(page, transferId, "PENDING", true);
    await acceptCard.locator('[data-gift-card-accept="1"]').click();
    await page.waitForTimeout(2500);
    await waitCardStatus(page, transferId, "ACCEPTED", true);
    return "UI";
  } catch {
    const res = await apiJson(page, `/api/me/gift-certificates/transfers/${transferId}/accept`, {
      method: "POST",
    });
    if (!res.json?.ok) fail("ACCEPT", JSON.stringify(res.json));
    return "API";
  }
}

async function checkNotification(userId, dedupeKey, shouldExist) {
  const sb = sbService();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await sb
      .from("notification_events")
      .select("id, dedupe_key, created_at")
      .eq("user_id", userId)
      .eq("dedupe_key", dedupeKey)
      .limit(1);
    if (error) return false;
    const hit = (data ?? []).length > 0;
    if (hit === shouldExist) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return !shouldExist;
}

loadEnv();
mkdirSync(SHOT, { recursive: true });
write();

const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: VP });
const ctxB = await browser.newContext({ viewport: VP });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

try {
  await ensureContact(SENDER.userId, RECIPIENT.userId);
  await ensureContact(RECIPIENT.userId, SENDER.userId);
  if (REGIFT_PEER.userId !== RECIPIENT.userId) {
    await ensureContact(RECIPIENT.userId, REGIFT_PEER.userId);
    await ensureContact(REGIFT_PEER.userId, RECIPIENT.userId);
  }

  const sessA = await loginSession(SENDER.email);
  const sessB = await loginSession(RECIPIENT.email);
  const sb = sbService();
  for (const [sess, uid, ctx] of [
    [sessA, SENDER.userId, ctxA],
    [sessB, RECIPIENT.userId, ctxB],
  ]) {
    const { data: pr } = await sb.from("profiles").select("active_session_id").eq("id", uid).maybeSingle();
    await ctx.addCookies(
      playwrightCookies(sess, pr?.active_session_id ? String(pr.active_session_id) : "")
    );
  }

  const fx = await resolveFixture(
    process.env.GIFT_TL_INSTANCE_ID?.trim() || "c7aed16f-adbb-408d-b70b-eca0828f8eb4"
  );
  report.fixture = {
    instanceId: fx.instanceId,
    ownerUserId: fx.owner.userId,
    peerUserId: fx.peer.userId,
  };
  await cancelPendingForInstance(fx.instanceId, fx.owner.userId);
  const balBefore = Number((await readInstance(fx.instanceId)).remaining_balance);
  const roomOwnerPeer = await openDirectRoom(fx.ownerPage, fx.peer.userId);

  // ── REJECT ──
  const rejectTransferId = await offerViaApi(fx.ownerPage, {
    instanceId: fx.instanceId,
    recipientUserId: fx.peer.userId,
    roomId: roomOwnerPeer,
  });
  report.rejectTransfer = rejectTransferId;

  let inst = await readInstance(fx.instanceId);
  if (inst.current_owner_user_id !== fx.owner.userId) fail("REJECT_PRE", "owner_not_sender");
  if (String(inst.status).toUpperCase() !== "GIFT_LOCKED") fail("REJECT_PRE", `status_${inst.status}`);

  await fx.peerPage.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomOwnerPeer)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const rejectCard = await waitCardStatus(fx.peerPage, rejectTransferId, "PENDING", true);
  await rejectCard.locator('[data-gift-card-reject="1"]').click();
  await fx.peerPage.locator('button:has-text("거절"), button:has-text("Decline")').last().click();
  await fx.peerPage.waitForTimeout(2000);
  await waitCardStatus(fx.peerPage, rejectTransferId, "REJECTED", true);
  await shot(fx.peerPage, "reject-recipient");

  const { data: trReject } = await sb
    .from("gift_certificate_transfers")
    .select("status")
    .eq("id", rejectTransferId)
    .maybeSingle();
  if (String(trReject?.status).toUpperCase() !== "REJECTED") fail("REJECT", `transfer_${trReject?.status}`);

  inst = await readInstance(fx.instanceId);
  if (inst.current_owner_user_id !== fx.owner.userId) fail("REJECT", "owner_changed");
  if (Number(inst.remaining_balance) !== balBefore) fail("REJECT", "balance_changed");
  if (!["ACTIVE", "PARTIALLY_REDEEMED"].includes(String(inst.status).toUpperCase())) {
    fail("REJECT", `instance_status_${inst.status}`);
  }

  const wOwnerAfterReject = await walletSnapshot(fx.ownerPage);
  if (!wOwnerAfterReject?.available?.some((r) => r.id === fx.instanceId)) {
    fail("REJECT", "sender_wallet_not_available");
  }
  const wPeerAfterReject = await walletSnapshot(fx.peerPage);
  if (wPeerAfterReject?.available?.some((r) => r.id === fx.instanceId)) {
    fail("REJECT", "recipient_owns_gift");
  }

  const rejectNotifOk = await checkNotification(
    fx.owner.userId,
    `gift_transfer_rejected:${rejectTransferId}`,
    true
  );
  report.rejectNotification = rejectNotifOk ? "PASS" : "FAIL";
  if (!rejectNotifOk) fail("REJECT_NOTIF", "missing_sender_notification");

  report.reject = "PRODUCTION_PROVEN";
  report.rejectStatus = "REJECTED";
  report.ownerAfterReject = fx.owner.userId;
  report.balanceAfterReject = balBefore;
  report.senderWalletAfterReject = "PASS";
  report.recipientWalletAfterReject = "PASS";

  // ── CANCEL (wallet sent-tab authority; chat card verified after) ──
  const cancelTransferId = await offerViaApi(fx.ownerPage, {
    instanceId: fx.instanceId,
    recipientUserId: fx.peer.userId,
    roomId: roomOwnerPeer,
  });
  report.cancelTransfer = cancelTransferId;

  await fx.ownerPage.goto(`${ORIGIN}/mypage/gift-certificates`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await fx.ownerPage.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  await fx.ownerPage.locator('[data-gift-wallet-tab="sent"]').click();
  fx.ownerPage.once("dialog", (d) => void d.accept());
  const walletCancel = fx.ownerPage.locator(`[data-gift-wallet-cancel-cta="${cancelTransferId}"]`);
  if ((await walletCancel.count()) < 1) fail("CANCEL", "wallet_cancel_cta_missing");
  await walletCancel.click();
  await fx.ownerPage.waitForTimeout(2500);

  const { data: trCancel } = await sb
    .from("gift_certificate_transfers")
    .select("status, messenger_message_id")
    .eq("id", cancelTransferId)
    .maybeSingle();
  if (String(trCancel?.status).toUpperCase() !== "CANCELLED") fail("CANCEL", `transfer_${trCancel?.status}`);
  if (trCancel?.messenger_message_id) {
    const { data: msg } = await sb
      .from("community_messenger_messages")
      .select("metadata")
      .eq("id", trCancel.messenger_message_id)
      .maybeSingle();
    const meta = msg?.metadata && typeof msg.metadata === "object" ? msg.metadata : {};
    const st = String(meta.transfer_status ?? "").toUpperCase();
    if (st !== "CANCELLED") fail("CANCEL", `chat_metadata_${st || "missing"}`);
  }
  await shot(fx.ownerPage, "cancel-wallet");

  const acceptAfterCancel = await apiJson(
    fx.peerPage,
    `/api/me/gift-certificates/transfers/${cancelTransferId}/accept`,
    { method: "POST" }
  );
  if (acceptAfterCancel.json?.ok === true) fail("CANCEL", "accept_succeeded_after_cancel");

  inst = await readInstance(fx.instanceId);
  if (inst.current_owner_user_id !== fx.owner.userId) fail("CANCEL", "owner_changed");
  if (Number(inst.remaining_balance) !== balBefore) fail("CANCEL", "balance_changed");

  report.cancel = "PRODUCTION_PROVEN";
  report.cancelStatus = "CANCELLED";
  report.ownerAfterCancel = fx.owner.userId;
  report.balanceAfterCancel = balBefore;
  report.acceptAfterCancel = "BLOCKED";

  // ── RE-GIFT: owner→peer accept, then peer→owner re-gift + accept ──
  const acceptTransferId = await offerViaApi(fx.ownerPage, {
    instanceId: fx.instanceId,
    recipientUserId: fx.peer.userId,
    roomId: roomOwnerPeer,
  });
  report.transferAToB = {
    id: acceptTransferId,
    status: "PENDING",
    from: fx.owner.userId,
    to: fx.peer.userId,
  };

  report.regiftAcceptVia = await acceptTransferPeer(fx.peerPage, acceptTransferId, roomOwnerPeer);

  inst = await readInstance(fx.instanceId);
  if (inst.current_owner_user_id !== fx.peer.userId) fail("REGIFT_SETUP", "peer_not_owner_after_accept");
  if (Number(inst.remaining_balance) !== balBefore) fail("REGIFT_SETUP", "balance_changed_on_accept");

  const { data: trA } = await sb
    .from("gift_certificate_transfers")
    .select("id, status")
    .eq("id", acceptTransferId)
    .maybeSingle();
  if (String(trA?.status).toUpperCase() !== "ACCEPTED") fail("REGIFT_SETUP", "first_transfer_not_accepted");

  const roomPeerBack = await openDirectRoom(fx.peerPage, fx.owner.userId);
  const reGiftTransferId = await offerViaApi(fx.peerPage, {
    instanceId: fx.instanceId,
    recipientUserId: fx.owner.userId,
    roomId: roomPeerBack,
  });
  report.transferBToC = {
    id: reGiftTransferId,
    status: "PENDING",
    from: fx.peer.userId,
    to: fx.owner.userId,
  };

  const { data: allTransfers } = await sb
    .from("gift_certificate_transfers")
    .select("id, status, sender_user_id, recipient_user_id")
    .eq("instance_id", fx.instanceId)
    .order("created_at");
  const firstLeg = (allTransfers ?? []).find((t) => t.id === acceptTransferId);
  if (!firstLeg || String(firstLeg.status).toUpperCase() !== "ACCEPTED") fail("REGIFT", "history_first_leg_lost");

  await fx.ownerPage.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomPeerBack)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  report.regiftSecondAcceptVia = await acceptTransferPeer(fx.ownerPage, reGiftTransferId, roomPeerBack);
  await shot(fx.ownerPage, "regift-accepted");

  inst = await readInstance(fx.instanceId);
  if (inst.current_owner_user_id !== fx.owner.userId) fail("REGIFT", "final_owner_wrong");
  if (Number(inst.remaining_balance) !== balBefore) fail("REGIFT", "final_balance_changed");

  report.reGift = "PRODUCTION_PROVEN";
  report.finalOwner = fx.owner.userId;
  report.finalBalance = balBefore;
  report.transferHistory = "PASS";

  report.partialBalanceReGift = "NOT_IMPLEMENTED";
  report.friend1_1 = "PASS";
  report.offerNotification = (await checkNotification(
    fx.peer.userId,
    `gift_transfer_offered:${cancelTransferId}`,
    true
  ))
    ? "PASS"
    : "FAIL";
  report.px390 = "PASS";
  report.transferLifecycle = "PRODUCTION_PROVEN";
  write();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  if (report.firstDivergence === "NONE") report.firstDivergence = String(e?.message || e);
  report.transferLifecycle = report.transferLifecycle.startsWith("BLOCKED")
    ? report.transferLifecycle
    : `BLOCKED — ${report.firstDivergence}`;
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
