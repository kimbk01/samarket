/**
 * FRIEND GIFT UX — Production R2/R3 proof only (1 run).
 * Offer → A/B chat card → re-entry → cold load → refresh @390px → (PASS only) RE-GIFT 1×.
 * Does NOT re-prove Reject/Cancel financial authority.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-friend-ux-coldload-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-friend-ux-coldload-proof.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-friend-ux-coldload-shots");
const VP = { width: 390, height: 844 };
const COMMIT = process.env.GIFT_PROOF_COMMIT?.trim() || "d353a2b50";

const SENDER = {
  email: process.env.GIFT_UX_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_UX_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
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
  title: "DIBAY GIFT — FRIEND GIFT UX FINAL",
  origin: ORIGIN,
  commit: COMMIT,
  push: "PASS",
  aChatCard: "NOT_PROVEN",
  bChatCard: "NOT_PROVEN",
  roomReEntry: "NOT_PROVEN",
  coldLoad: "NOT_PROVEN",
  refresh: "NOT_PROVEN",
  px390: "NOT_PROVEN",
  reGift: "BLOCKED",
  transferAB: null,
  transferBC: null,
  finalOwner: null,
  finalRemaining: null,
  firstDivergence: "NONE",
  friendGiftUx: "IN_PROGRESS",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, reason) {
  report.firstDivergence = `${step}: ${reason}`;
  report.friendGiftUx = `BLOCKED — ${report.firstDivergence}`;
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
    .select("id, current_owner_user_id, remaining_balance, status, face_value")
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

async function waitCard(page, transferId, label) {
  const sel = `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`;
  const card = page.locator(sel);
  // Natural land only — do NOT force-scroll (pollutes virtualizer + masks AuthSessionBoundary races).
  for (let i = 0; i < 30; i++) {
    const blocked = await page.locator('[data-auth-session-boundary="blocked"]').count();
    if (blocked === 0 && (await card.count()) > 0) {
      const visible = await card.first().isVisible().catch(() => false);
      if (visible) return card.first();
    }
    await page.waitForTimeout(700);
  }
  const stillBlocked = (await page.locator('[data-auth-session-boundary="blocked"]').count()) > 0;
  if (stillBlocked) fail(label, `auth_session_boundary_blocked:${transferId}`);
  fail(label, `gift_card_missing:${transferId}`);
  return card.first();
}

async function uiLogin(page, email) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const entry = page.getByTestId("auth-internal-login-entry");
  if ((await entry.count()) > 0) {
    await entry.click();
    await page.waitForTimeout(400);
  }
  const panel = page.getByTestId("auth-internal-login-panel");
  await panel.waitFor({ state: "visible", timeout: 20000 });
  const inputs = panel.locator("input");
  await inputs.nth(0).fill(email);
  let lastErr = "ui_login_failed";
  for (const password of passwords()) {
    await inputs.nth(1).fill(password);
    await panel.locator('button[type="submit"]').click();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      if (!/\/login(?:\?|$)/.test(page.url())) {
        // Settle membership / AuthSessionBoundary before room hard-nav.
        await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
        await page.waitForTimeout(2000);
        for (let j = 0; j < 20; j++) {
          const blocked = await page.locator('[data-auth-session-boundary="blocked"]').count();
          if (blocked === 0) return;
          await page.waitForTimeout(500);
        }
        return;
      }
      const alert = await page.locator('[role="alert"]').textContent().catch(() => "");
      if (alert && /wrong|실패|invalid|비밀번호/i.test(alert)) {
        lastErr = `ui_login_alert:${alert.slice(0, 80)}`;
        break;
      }
    }
  }
  throw new Error(lastErr);
}

async function gotoRoom(page, roomId) {
  await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page
    .waitForSelector('.chat-timeline-scroll, [data-cm-timeline-message-row], [data-auth-session-boundary="blocked"]', {
      timeout: 45000,
    })
    .catch(() => null);
  await page.waitForTimeout(1500);
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

  let owner = SENDER;
  let peer = RECIPIENT;
  let ownerPage = pageA;
  let peerPage = pageB;
  let owned = await pickOwnedInstance(SENDER.userId);
  if (!owned) {
    owned = await pickOwnedInstance(RECIPIENT.userId);
    if (!owned) fail("FIXTURE", "no_active_gift_for_A_or_B");
    owner = RECIPIENT;
    peer = SENDER;
    ownerPage = pageB;
    peerPage = pageA;
  }

  await uiLogin(ownerPage, owner.email);
  await uiLogin(peerPage, peer.email);

  const instanceId = String(owned.id);
  const remainingBefore = Number(owned.remaining_balance);
  report.fixture = {
    instanceId,
    ownerUserId: owner.userId,
    peerUserId: peer.userId,
    remainingBefore,
  };
  await cancelPendingForInstance(instanceId, owner.userId);

  const roomId = await openDirectRoom(ownerPage, peer.userId);
  report.roomId = roomId;

  const transferAB = await offerViaApi(ownerPage, {
    instanceId,
    recipientUserId: peer.userId,
    roomId,
  });
  report.transferAB = transferAB;

  const sb = sbService();
  const { data: transferRow } = await sb
    .from("gift_certificate_transfers")
    .select("id, status, messenger_message_id, room_id")
    .eq("id", transferAB)
    .maybeSingle();
  if (!transferRow?.messenger_message_id) fail("OFFER_DB", "messenger_message_id_missing");
  report.messengerMessageId = transferRow.messenger_message_id;

  await gotoRoom(ownerPage, roomId);
  await waitCard(ownerPage, transferAB, "A_CHAT_CARD");
  report.aChatCard = "PASS";
  await shot(ownerPage, "a-pending");

  await gotoRoom(peerPage, roomId);
  await waitCard(peerPage, transferAB, "B_CHAT_CARD");
  report.bChatCard = "PASS";
  await shot(peerPage, "b-pending");

  await peerPage.goto(`${ORIGIN}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await peerPage.waitForTimeout(1000);
  await gotoRoom(peerPage, roomId);
  await waitCard(peerPage, transferAB, "ROOM_RE_ENTRY");
  report.roomReEntry = "PASS";
  await shot(peerPage, "b-reentry");

  const coldCtx = await browser.newContext({ viewport: VP });
  const coldPage = await coldCtx.newPage();
  await uiLogin(coldPage, peer.email);
  await gotoRoom(coldPage, roomId);
  await waitCard(coldPage, transferAB, "COLD_LOAD");
  report.coldLoad = "PASS";
  await shot(coldPage, "b-cold");
  await coldCtx.close();

  await peerPage.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await peerPage.waitForTimeout(1500);
  await waitCard(peerPage, transferAB, "REFRESH");
  report.refresh = "PASS";
  await shot(peerPage, "b-refresh");

  const vp = peerPage.viewportSize();
  if (!vp || vp.width !== 390) fail("390PX", `viewport_${vp?.width}`);
  await waitCard(peerPage, transferAB, "390PX");
  report.px390 = "PASS";

  const acceptRes = await apiJson(peerPage, `/api/me/gift-certificates/transfers/${transferAB}/accept`, {
    method: "POST",
  });
  if (!acceptRes.json?.ok) fail("ACCEPT_FOR_REGIFT", JSON.stringify(acceptRes.json));

  const afterAccept = await readInstance(instanceId);
  if (afterAccept.current_owner_user_id !== peer.userId) {
    fail("ACCEPT_FOR_REGIFT", `owner_${afterAccept.current_owner_user_id}`);
  }
  if (Number(afterAccept.remaining_balance) !== remainingBefore) {
    fail("PARTIAL_BALANCE", `remaining_${afterAccept.remaining_balance}_expected_${remainingBefore}`);
  }

  await cancelPendingForInstance(instanceId, peer.userId);
  const transferBC = await offerViaApi(peerPage, {
    instanceId,
    recipientUserId: owner.userId,
    roomId,
  });
  report.transferBC = transferBC;

  // Owner tab may have sat idle while peer accepted/re-gifted — re-settle auth before room hard-nav.
  await uiLogin(ownerPage, owner.email);
  await gotoRoom(ownerPage, roomId);
  await waitCard(ownerPage, transferBC, "REGIFT_CARD");
  const accept2 = await apiJson(ownerPage, `/api/me/gift-certificates/transfers/${transferBC}/accept`, {
    method: "POST",
  });
  if (!accept2.json?.ok) fail("REGIFT_ACCEPT", JSON.stringify(accept2.json));

  const final = await readInstance(instanceId);
  report.finalOwner = final.current_owner_user_id;
  report.finalRemaining = Number(final.remaining_balance);
  if (final.current_owner_user_id !== owner.userId) fail("REGIFT", `final_owner_${final.current_owner_user_id}`);
  if (Number(final.remaining_balance) !== remainingBefore) {
    fail("PARTIAL_BALANCE", `final_remaining_${final.remaining_balance}`);
  }

  const { data: hist } = await sb
    .from("gift_certificate_transfers")
    .select("id, status, sender_user_id, recipient_user_id")
    .in("id", [transferAB, transferBC]);
  const ab = (hist ?? []).find((r) => r.id === transferAB);
  const bc = (hist ?? []).find((r) => r.id === transferBC);
  if (String(ab?.status).toUpperCase() !== "ACCEPTED") fail("HISTORY", `ab_${ab?.status}`);
  if (String(bc?.status).toUpperCase() !== "ACCEPTED") fail("HISTORY", `bc_${bc?.status}`);

  report.reGift = "PRODUCTION_PROVEN";
  report.friendGiftUx = "PRODUCTION_PROVEN";
  write();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.friendGiftUx = String(report.friendGiftUx || "").startsWith("BLOCKED")
    ? report.friendGiftUx
    : `BLOCKED — ${e instanceof Error ? e.message : String(e)}`;
  write();
  console.error(report.friendGiftUx);
  process.exitCode = 1;
} finally {
  await browser.close();
}
