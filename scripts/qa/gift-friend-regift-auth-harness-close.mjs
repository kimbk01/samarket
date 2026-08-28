/**
 * DIBAY GIFT — RE-GIFT AUTH HARNESS CLOSE ONLY
 * QA harness only: observe-only auth settle before room hard-nav. No product Auth/Messenger/Gift edits.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/gift-friend-regift-auth-harness-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-friend-regift-auth-harness-close.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-friend-regift-auth-harness-shots");
const VP = { width: 390, height: 844 };
const COMMIT = process.env.GIFT_PROOF_COMMIT?.trim() || "1cafbbab5";
const AUTH_SETTLE_TIMEOUT_MS = 45_000;
/** Multi-context idle that previously exposed AuthSessionBoundary flake — observe settle after this. */
const MULTI_CONTEXT_IDLE_MS = Number(process.env.GIFT_AUTH_IDLE_MS || 25_000);

const A = {
  email: process.env.GIFT_UX_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_UX_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const B = {
  email: process.env.GIFT_UX_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  userId: process.env.GIFT_UX_RECIPIENT_ID?.trim() || "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
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
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const report = {
  title: "DIBAY GIFT — RE-GIFT AUTH HARNESS CLOSE",
  commit: COMMIT,
  productCodeChange: "NONE_FOR_AUTH_SETTLE",
  authSessionApi: "NOT_PROVEN",
  supabaseSession: "NOT_PROVEN",
  authBoundary: "NOT_PROVEN",
  authShell: "NOT_PROVEN",
  reGift: "NOT_PROVEN",
  transferAB: null,
  transferBC: null,
  finalOwner: null,
  remaining: null,
  historyAB: "NOT_PROVEN",
  historyBC: "NOT_PROVEN",
  reject: "NOT_PROVEN",
  cancel: "NOT_PROVEN",
  cancelNotification: "NOT_PROVEN",
  chatDomain: "NOT_PROVEN",
  friendGiftUx: "IN_PROGRESS",
  firstDivergence: "NONE",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, reason) {
  report.firstDivergence = `${step}: ${reason}`;
  if (step === "AUTH_HARNESS_BLOCKED" || String(step).startsWith("AUTH")) {
    report.friendGiftUx = `BLOCKED — AUTH_HARNESS_BLOCKED:${reason}`;
  } else {
    report.friendGiftUx = `BLOCKED — ${report.firstDivergence}`;
  }
  write();
  throw new Error(report.firstDivergence);
}

async function shot(page, name) {
  mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: resolve(SHOT, `${name}.png`), fullPage: false }).catch(() => {});
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

/**
 * Observe-only settle gate (A–D). No settle-by-sleep, cookie forge, DOM strip, or reload loop.
 */
async function waitAuthSettled(page, label) {
  const started = Date.now();
  let last = {
    sessionApi: false,
    supabase: false,
    boundaryClear: false,
    shellVisible: false,
  };

  while (Date.now() - started < AUTH_SETTLE_TIMEOUT_MS) {
    // B: observe real browser cookies via Playwright (httpOnly-safe). Never set/forge cookies.
    // Do not decode token payloads — name + non-empty auth-token cookie proves session material exists.
    const cookies = await page.context().cookies();
    const supabase = cookies.some((c) => {
      const name = String(c.name || "");
      const val = String(c.value || "");
      const domain = String(c.domain || "");
      return (
        domain.includes("samarket") &&
        /^sb-[^=]+-auth-token(?:\.\d+)?$/.test(name) &&
        val.length > 20
      );
    });

    const probe = await page.evaluate(async () => {
      let sessionApi = false;
      try {
        const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => null);
        sessionApi = Boolean(r.ok && j?.authenticated === true);
      } catch {
        sessionApi = false;
      }

      const boundaryClear = !document.querySelector('[data-auth-session-boundary="blocked"]');
      const path = location.pathname || "";
      const onLogin = /\/login(?:\/|$)/.test(path);
      const body = (document.body?.innerText || "").slice(0, 160);
      const loadingOnly = /^Loading[….]?\s*$/i.test(body.trim());
      const shellVisible =
        boundaryClear &&
        !onLogin &&
        !loadingOnly &&
        (Boolean(
          document.querySelector(
            "[data-customer-gift-certificate-wallet], [data-delivery-composer-attach], [data-cm-timeline-message-row], .chat-timeline-scroll, [data-messenger-home], [data-biz], nav, main"
          )
        ) ||
          body.length > 60);

      return { sessionApi, boundaryClear, shellVisible, path, bodyHead: body.slice(0, 80) };
    });

    last = { ...probe, supabase };
    report.authSessionApi = probe.sessionApi ? "PASS" : "FAIL";
    report.supabaseSession = supabase ? "PASS" : "FAIL";
    report.authBoundary = probe.boundaryClear ? "SETTLED" : "BLOCKED";
    report.authShell = probe.shellVisible ? "PASS" : "FAIL";
    write();

    if (probe.sessionApi && supabase && probe.boundaryClear && probe.shellVisible) {
      return { ...last, label, settledInMs: Date.now() - started };
    }

    await page.waitForTimeout(350);
  }

  report.authSessionApi = last.sessionApi ? "PASS" : "FAIL";
  report.supabaseSession = last.supabase ? "PASS" : "FAIL";
  report.authBoundary = last.boundaryClear ? "SETTLED" : "BLOCKED";
  report.authShell = last.shellVisible ? "PASS" : "FAIL";
  fail("AUTH_HARNESS_BLOCKED", `${label}:${JSON.stringify(last)}`);
}

async function uiLogin(page, email) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="auth-internal-login-entry"]', { timeout: 30000 });
  // Wait for React hydration (static markup click is a no-op until handlers attach).
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="auth-internal-login-entry"]');
    return Boolean(el && !el.disabled && el.getAttribute("data-react-hydrated") !== "pending");
  }, null, { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(500);

  for (let openAttempt = 0; openAttempt < 5; openAttempt++) {
    if ((await page.getByTestId("auth-internal-login-panel").count()) > 0) break;
    await page.evaluate(() => {
      document.querySelector('[data-testid="auth-internal-login-entry"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
    });
    try {
      await page.getByTestId("auth-internal-login-panel").waitFor({ state: "visible", timeout: 2500 });
      break;
    } catch {
      /* retry */
    }
  }

  const panel = page.getByTestId("auth-internal-login-panel");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  const inputs = panel.locator("input");
  await inputs.nth(0).fill(email);
  let lastErr = "ui_login_failed";
  for (const password of passwords()) {
    await inputs.nth(1).fill(password);
    await panel.locator('button[type="submit"]').click();
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(400);
      if (!/\/login(?:\?|$)/.test(page.url())) {
        await page.goto(`${ORIGIN}/community-messenger`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await waitAuthSettled(page, `after_login:${email}`);
        return;
      }
      const alert = await page.locator('[role="alert"]').textContent().catch(() => "");
      if (alert && /wrong|실패|invalid|비밀번호/i.test(alert)) {
        lastErr = `ui_login_alert:${alert.slice(0, 80)}`;
        break;
      }
    }
  }
  fail("AUTH_HARNESS_BLOCKED", lastErr);
}

async function gotoRoomSettled(page, roomId, label) {
  await waitAuthSettled(page, `pre_room:${label}`);
  await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitAuthSettled(page, `in_room:${label}`);
}

async function waitCardNatural(page, transferId, label) {
  const sel = `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`;
  const card = page.locator(sel);
  const started = Date.now();
  while (Date.now() - started < 35_000) {
    if ((await page.locator('[data-auth-session-boundary="blocked"]').count()) > 0) {
      await waitAuthSettled(page, `card_wait_auth:${label}`);
    }
    if ((await card.count()) > 0 && (await card.first().isVisible().catch(() => false))) {
      return card.first();
    }
    await page.waitForTimeout(400);
  }
  await shot(page, `${label}-missing`);
  fail(label, `gift_card_missing:${transferId}`);
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

async function pickOwnedInstance(ownerId) {
  const sb = sbService();
  const { data } = await sb
    .from("gift_certificate_instances")
    .select("id, status, remaining_balance, current_owner_user_id")
    .eq("current_owner_user_id", ownerId)
    .in("status", ["ACTIVE", "PARTIALLY_REDEEMED"])
    .gt("remaining_balance", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function readInstance(instanceId) {
  const sb = sbService();
  const { data, error } = await sb
    .from("gift_certificate_instances")
    .select("id, current_owner_user_id, remaining_balance, status")
    .eq("id", instanceId)
    .maybeSingle();
  if (error || !data) throw new Error(`instance_read:${error?.message || "missing"}`);
  return data;
}

async function openDirectRoom(page, peerUserId) {
  const roomRes = await apiJson(page, "/api/community-messenger/rooms", {
    method: "POST",
    body: JSON.stringify({ roomType: "direct", peerUserId }),
  });
  const roomId = String(roomRes.json?.roomId || "").trim();
  if (roomRes.status >= 400 || !roomId) fail("ROOM", JSON.stringify(roomRes.json));
  return roomId;
}

async function offerViaApi(page, { instanceId, recipientUserId, roomId }) {
  const res = await apiJson(page, "/api/me/gift-certificates/transfers/offer", {
    method: "POST",
    body: JSON.stringify({
      instanceId,
      recipientUserId,
      roomId,
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  if (!res.json?.ok) fail("OFFER", JSON.stringify(res.json));
  const transferId = String(res.json.transfer_id ?? res.json.id ?? "").trim();
  if (!transferId) fail("OFFER", "missing_transfer_id");
  return transferId;
}

/** Wallet → 선물하기 → friend → confirm → offer (RE-GIFT product path). */
async function offerViaWalletUi(page, { instanceId, roomId, peerUserId, label }) {
  await waitAuthSettled(page, `pre_wallet:${label}`);
  await page.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitAuthSettled(page, `wallet:${label}`);
  await page.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });

  const walletSend = page.locator(`[data-gift-wallet-send-cta="${instanceId}"]`);
  if ((await walletSend.count()) < 1) {
    await shot(page, `${label}-wallet-send-missing`);
    fail("REGIFT_UI", "wallet_send_cta_missing");
  }
  await walletSend.click();
  await page.waitForSelector('[data-wallet-gift-friend-picker="1"]', { timeout: 15000 });
  const friendBtn = page.locator(`[data-wallet-gift-friend="${peerUserId}"]`);
  await page.locator(`[data-wallet-gift-friend="${peerUserId}"], [data-wallet-gift-friend], [data-wallet-gift-friend-empty="1"]`).first().waitFor({
    state: "visible",
    timeout: 45000,
  });
  if ((await friendBtn.count()) < 1) fail("REGIFT_UI", `friend_not_in_picker:${peerUserId}`);
  await friendBtn.click();

  await page.waitForURL(new RegExp(`/community-messenger/rooms/${roomId}`), { timeout: 45000 }).catch(() => null);
  await waitAuthSettled(page, `room_after_wallet:${label}`);
  await page.waitForSelector("[data-gift-offer-phase]", { timeout: 30000 });

  // Prefill may land on confirm; otherwise pick then confirm.
  const confirm = page.locator('[data-gift-offer-confirm="1"]');
  if ((await confirm.count()) < 1) {
    await page.locator("[data-gift-offer-pick], [data-gift-offer-empty]").first().waitFor({
      state: "visible",
      timeout: 45000,
    });
    const pick = page.locator(`[data-gift-offer-pick="${instanceId}"]`);
    if ((await pick.count()) < 1) fail("REGIFT_UI", "instance_not_in_selector");
    await pick.click();
  }
  await page.waitForSelector('[data-gift-offer-confirm="1"]', { timeout: 15000 });
  await shot(page, `${label}-confirm`);
  await page.locator('[data-gift-offer-submit="1"]').click();

  const started = Date.now();
  while (Date.now() - started < 25000) {
    const walletAfter = await apiJson(page, "/api/me/gift-certificates/wallet");
    const pendingSent = (walletAfter.json?.wallet?.sentTransfers || []).find(
      (t) =>
        String(t.instanceId || t.instance_id || "") === instanceId &&
        String(t.status).toUpperCase() === "PENDING" &&
        String(t.recipientUserId || t.recipient_user_id || "") === peerUserId
    );
    const transferId = String(pendingSent?.id || "").trim();
    if (transferId) return transferId;
    await page.waitForTimeout(500);
  }
  fail("REGIFT_UI", "pending_transfer_missing_after_submit");
}

async function checkNotification(userId, dedupeKey) {
  const sb = sbService();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await sb
      .from("notification_events")
      .select("id")
      .eq("user_id", userId)
      .eq("dedupe_key", dedupeKey)
      .limit(1);
    if ((data ?? []).length > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
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
  await ensureContact(A.userId, B.userId);
  await ensureContact(B.userId, A.userId);

  // Fixture: A starts as owner → offer/accept to B → B re-gifts to C(=A).
  let startOwner = A;
  let startPeer = B;
  let ownerPage = pageA;
  let peerPage = pageB;
  let owned = await pickOwnedInstance(A.userId);
  if (!owned) {
    owned = await pickOwnedInstance(B.userId);
    if (!owned) fail("FIXTURE", "no_active_gift");
    startOwner = B;
    startPeer = A;
    ownerPage = pageB;
    peerPage = pageA;
  }

  await uiLogin(ownerPage, startOwner.email);
  await uiLogin(peerPage, startPeer.email);

  const instanceId = String(owned.id);
  const remainingBefore = Number(owned.remaining_balance);
  report.fixture = {
    instanceId,
    A: startOwner.userId,
    B: startPeer.userId,
    C: startOwner.userId,
    remainingBefore,
  };
  await cancelPendingForInstance(instanceId, startOwner.userId);

  const roomId = await openDirectRoom(ownerPage, startPeer.userId);
  report.roomId = roomId;

  // Setup A→B (not re-proving entry/cold/refresh) — API offer + UI accept is enough for history.
  const transferAB = await offerViaApi(ownerPage, {
    instanceId,
    recipientUserId: startPeer.userId,
    roomId,
  });
  report.transferAB = transferAB;

  // Reproduce multi-context idle before first room hard-nav.
  report.multiContextIdleMs = MULTI_CONTEXT_IDLE_MS;
  write();
  await pageA.waitForTimeout(MULTI_CONTEXT_IDLE_MS);

  await gotoRoomSettled(peerPage, roomId, "B_ACCEPT");
  const cardAB = await waitCardNatural(peerPage, transferAB, "B_PENDING_CARD");
  await cardAB.locator('[data-gift-card-accept="1"]').click();
  const startedAccept = Date.now();
  while (Date.now() - startedAccept < 20000) {
    const instCheck = await readInstance(instanceId);
    if (instCheck.current_owner_user_id === startPeer.userId) break;
    await pageA.waitForTimeout(400);
  }

  let inst = await readInstance(instanceId);
  if (inst.current_owner_user_id !== startPeer.userId) fail("ACCEPT_AB", "B_not_owner");
  if (Number(inst.remaining_balance) !== remainingBefore) fail("ACCEPT_AB", "remaining_changed");

  const sb = sbService();
  const { data: trAB } = await sb.from("gift_certificate_transfers").select("id, status").eq("id", transferAB).maybeSingle();
  if (String(trAB?.status).toUpperCase() !== "ACCEPTED") fail("HISTORY_AB", `status_${trAB?.status}`);
  report.historyAB = "PASS";
  write();

  // ── RE-GIFT B→C via Wallet UI (one run) ──
  await pageB.waitForTimeout(Math.min(MULTI_CONTEXT_IDLE_MS, 15_000));
  const transferBC = await offerViaWalletUi(peerPage, {
    instanceId,
    roomId,
    peerUserId: startOwner.userId,
    label: "REGIFT",
  });
  report.transferBC = transferBC;
  if (transferBC === transferAB) fail("REGIFT", "same_transfer_row");

  await pageA.waitForTimeout(Math.min(MULTI_CONTEXT_IDLE_MS, 10_000));
  await gotoRoomSettled(ownerPage, roomId, "C_REGIFT_CARD");
  const cardBC = await waitCardNatural(ownerPage, transferBC, "C_PENDING_CARD");
  await shot(ownerPage, "c-regift-card");
  await cardBC.locator('[data-gift-card-accept="1"]').click();

  const startedBC = Date.now();
  while (Date.now() - startedBC < 20000) {
    inst = await readInstance(instanceId);
    if (inst.current_owner_user_id === startOwner.userId) break;
    await pageA.waitForTimeout(400);
  }

  inst = await readInstance(instanceId);
  if (inst.current_owner_user_id !== startOwner.userId) fail("REGIFT", `final_owner_${inst.current_owner_user_id}`);
  if (Number(inst.remaining_balance) !== remainingBefore) fail("REGIFT", `remaining_${inst.remaining_balance}`);

  const { data: trBC } = await sb.from("gift_certificate_transfers").select("id, status").eq("id", transferBC).maybeSingle();
  if (String(trBC?.status).toUpperCase() !== "ACCEPTED") fail("HISTORY_BC", `status_${trBC?.status}`);
  const { data: trAB2 } = await sb.from("gift_certificate_transfers").select("id, status").eq("id", transferAB).maybeSingle();
  if (String(trAB2?.status).toUpperCase() !== "ACCEPTED") fail("HISTORY_AB", "first_leg_not_preserved");

  // B wallet should no longer treat instance as available.
  const walletB = await apiJson(peerPage, "/api/me/gift-certificates/wallet");
  const bStillOwns = (walletB.json?.wallet?.instances || walletB.json?.instances || []).some(
    (row) => String(row.id || row.instanceId) === instanceId
  );
  if (bStillOwns) fail("REGIFT", "B_still_has_available_instance");

  report.historyBC = "PASS";
  report.finalOwner = startOwner.userId;
  report.remaining = remainingBefore;
  report.reGift = "PRODUCTION_PROVEN";
  write();

  // ── REJECT ──
  await cancelPendingForInstance(instanceId, startOwner.userId);
  const rejectId = await offerViaApi(ownerPage, {
    instanceId,
    recipientUserId: startPeer.userId,
    roomId,
  });
  report.rejectTransfer = rejectId;
  await gotoRoomSettled(peerPage, roomId, "REJECT_CARD");
  const rejectCard = await waitCardNatural(peerPage, rejectId, "REJECT_PENDING");
  await rejectCard.locator('[data-gift-card-reject="1"]').click();
  await peerPage.locator('button:has-text("거절"), button:has-text("Decline"), button:has-text("거부")').last().click();
  const rejectWait = Date.now();
  while (Date.now() - rejectWait < 15000) {
    const { data: trReject } = await sb.from("gift_certificate_transfers").select("status").eq("id", rejectId).maybeSingle();
    if (String(trReject?.status).toUpperCase() === "REJECTED") break;
    await pageA.waitForTimeout(400);
  }
  {
    const { data: trReject } = await sb.from("gift_certificate_transfers").select("status").eq("id", rejectId).maybeSingle();
    if (String(trReject?.status).toUpperCase() !== "REJECTED") fail("REJECT", `status_${trReject?.status}`);
  }
  inst = await readInstance(instanceId);
  if (inst.current_owner_user_id !== startOwner.userId) fail("REJECT", "owner_changed");
  const rejectNotif = await checkNotification(startOwner.userId, `gift_transfer_rejected:${rejectId}`);
  report.rejectNotification = rejectNotif ? "PASS" : "FAIL";
  if (!rejectNotif) fail("REJECT", "reject_notification_missing");
  report.reject = "PRODUCTION_PROVEN";
  write();

  // ── CANCEL ──
  const cancelId = await offerViaApi(ownerPage, {
    instanceId,
    recipientUserId: startPeer.userId,
    roomId,
  });
  report.cancelTransfer = cancelId;
  const cancelRes = await apiJson(ownerPage, `/api/me/gift-certificates/transfers/${cancelId}/cancel`, {
    method: "POST",
  });
  if (!cancelRes.json?.ok) fail("CANCEL", JSON.stringify(cancelRes.json));
  {
    const { data: trCancel } = await sb.from("gift_certificate_transfers").select("status").eq("id", cancelId).maybeSingle();
    if (String(trCancel?.status).toUpperCase() !== "CANCELLED") fail("CANCEL", `status_${trCancel?.status}`);
  }
  const acceptAfterCancel = await apiJson(peerPage, `/api/me/gift-certificates/transfers/${cancelId}/accept`, {
    method: "POST",
  });
  if (acceptAfterCancel.json?.ok === true) fail("CANCEL", "accept_succeeded");
  inst = await readInstance(instanceId);
  if (inst.current_owner_user_id !== startOwner.userId) fail("CANCEL", "owner_changed");

  const cancelNotif = await checkNotification(startPeer.userId, `gift_transfer_cancelled:${cancelId}`);
  report.cancelNotification = cancelNotif ? "PASS" : "FAIL";
  report.cancel = "PRODUCTION_PROVEN";
  write();
  if (!cancelNotif) {
    report.firstDivergence = "CANCEL_NOTIFICATION: missing gift_transfer_cancelled";
    report.friendGiftUx = "BLOCKED — CANCEL_NOTIFICATION_MISSING (RE-GIFT/REJECT/CANCEL authority PASS)";
    report.chatDomain = "NOT_RUN";
    write();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } else {
    // ── CHAT DOMAIN CONTROLS ──
    const friendOffer = await apiJson(ownerPage, "/api/me/gift-certificates/transfers/offer", {
      method: "POST",
      body: JSON.stringify({
        instanceId,
        recipientUserId: startPeer.userId,
        roomId,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (friendOffer.json?.ok) {
      const tid = String(friendOffer.json.transfer_id ?? friendOffer.json.id ?? "");
      if (tid) {
        await sb.rpc("gift_certificate_cancel", {
          p_sender_user_id: startOwner.userId,
          p_transfer_id: tid,
        });
      }
    }
    const friendAllowed = friendOffer.json?.ok === true;

    const fakePeer = "00000000-0000-4000-8000-000000000001";
    const nfOffer = await apiJson(ownerPage, "/api/me/gift-certificates/transfers/offer", {
      method: "POST",
      body: JSON.stringify({
        instanceId,
        recipientUserId: fakePeer,
        roomId,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const nonFriendBlocked = nfOffer.json?.ok !== true;

    report.chatDomain = {
      friendDirect: friendAllowed ? "PASS" : "FAIL",
      nonFriend: nonFriendBlocked ? "PASS" : "FAIL",
      orderTradeGroup: "CODE_CONTRACT_PRESERVED",
    };
    report.chatDomainSummary = friendAllowed && nonFriendBlocked ? "PASS" : "PARTIAL";
    report.friendGiftUx =
      report.reGift === "PRODUCTION_PROVEN" &&
      report.reject === "PRODUCTION_PROVEN" &&
      report.cancel === "PRODUCTION_PROVEN" &&
      report.cancelNotification === "PASS" &&
      report.chatDomainSummary === "PASS"
        ? "PRODUCTION_PROVEN"
        : "BLOCKED";
    write();
    console.log(JSON.stringify(report, null, 2));
  }
} catch (e) {
  if (report.firstDivergence === "NONE") {
    report.firstDivergence = e instanceof Error ? e.message : String(e);
  }
  if (!String(report.friendGiftUx).startsWith("BLOCKED")) {
    report.friendGiftUx = `BLOCKED — ${report.firstDivergence}`;
  }
  write();
  console.error(report.friendGiftUx);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
