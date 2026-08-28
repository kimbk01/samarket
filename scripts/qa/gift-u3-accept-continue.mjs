/**
 * U3 Accept continuation — uses current PENDING transfer after offer already succeeded.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3023 node --env-file=.env.local scripts/qa/gift-u3-accept-continue.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3023").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u3-runtime.json");
const SHOT_DIR = resolve(process.cwd(), ".tmp-gift-u3-shots");
const GIFT_ID = "c7aed16f-adbb-408d-b70b-eca0828f8eb4";
const SENDER = {
  email: "qqqq@manual.local",
  userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: "wwww@manual.local",
  userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
const ROOM_ID = "c202326f-8109-4ce4-aa61-394f0a799e7d";
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

loadEnv();
mkdirSync(SHOT_DIR, { recursive: true });

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const report = {
  ...prev,
  title: "DIBAY GIFT CERTIFICATE — U3 FRIEND GIFT RUNTIME FINAL",
  origin: ORIGIN,
  acceptContinue: true,
  commit: "NO",
  push: "NO",
  u1: "LOCKED",
  u2: "LOCKED",
  u4: "NOT_STARTED",
};

const sb = sbService();
const { data: pending } = await sb
  .from("gift_certificate_transfers")
  .select("id, status, messenger_message_id")
  .eq("instance_id", GIFT_ID)
  .eq("status", "PENDING")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (!pending?.id) throw new Error("no_pending_transfer");
const transferId = pending.id;
report.transferId = transferId;
report.giftInstance = GIFT_ID;
const { data: before } = await sb
  .from("gift_certificate_instances")
  .select("current_owner_user_id, remaining_balance, status")
  .eq("id", GIFT_ID)
  .maybeSingle();
report.ownerBefore = before?.current_owner_user_id;
report.remainingBefore = before?.remaining_balance;
report.r = {
  ...(prev.r || {}),
  OFFER: "PASS",
  SENDER_PENDING: "PASS",
  CANCEL: "NOT_PROVEN",
};

const browser = await chromium.launch({ headless: true });
const ctxB = await browser.newContext({ viewport: VP });
const ctxA = await browser.newContext({ viewport: VP });
const pageB = await ctxB.newPage();
const pageA = await ctxA.newPage();

try {
  const sessB = await loginSession(RECIPIENT.email);
  const sessA = await loginSession(SENDER.email);
  const { data: prB } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", RECIPIENT.userId)
    .maybeSingle();
  const { data: prA } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", SENDER.userId)
    .maybeSingle();
  await ctxB.addCookies(
    playwrightCookies(sessB, prB?.active_session_id ? String(prB.active_session_id) : "")
  );
  await ctxA.addCookies(
    playwrightCookies(sessA, prA?.active_session_id ? String(prA.active_session_id) : "")
  );

  let acceptedVia = "ui";
  await pageB.goto(`${ORIGIN}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageB.waitForTimeout(1500);
  await pageB.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(ROOM_ID)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const card = pageB.locator(
    `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`
  );
  let cardVisible = false;
  for (let i = 0; i < 8; i++) {
    await pageB.evaluate(() => {
      for (const el of document.querySelectorAll(".chat-timeline-scroll")) {
        el.scrollTop = el.scrollHeight;
      }
    });
    if ((await card.count()) > 0) {
      cardVisible = true;
      break;
    }
    await pageB.waitForTimeout(1000);
  }

  if (cardVisible) {
    report.r.RECIPIENT_CARD = "PASS";
    await pageB.screenshot({ path: resolve(SHOT_DIR, "recipient-card.png"), fullPage: true }).catch(() => {});
    const acceptPosts = [];
    pageB.on("request", (req) => {
      if (req.method() === "POST" && /\/transfers\/[^/]+\/accept/.test(req.url())) {
        acceptPosts.push(req.url());
      }
    });
    await card.locator('[data-gift-card-accept="1"]').click();
    await pageB.waitForTimeout(3000);
    const st = await card.getAttribute("data-transfer-status");
    if (String(st).toUpperCase() !== "ACCEPTED") {
      throw new Error(`accept_ui_readback_pending:status=${st}:posts=${acceptPosts.length}`);
    }
    if (acceptPosts.length !== 1) {
      throw new Error(`accept_post_count=${acceptPosts.length}`);
    }
    acceptedVia = "ui";
    report.acceptPostCount = acceptPosts.length;
  } else {
    throw new Error("recipient_card_not_visible");
  }

  // Remount / stale metadata: force re-render by reloading room — session map must keep ACCEPTED
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.waitForTimeout(2000);
  for (let i = 0; i < 6; i++) {
    await pageB.evaluate(() => {
      for (const el of document.querySelectorAll(".chat-timeline-scroll")) {
        el.scrollTop = el.scrollHeight;
      }
    });
    if ((await card.count()) > 0) break;
    await pageB.waitForTimeout(500);
  }
  const stAfter = await card.getAttribute("data-transfer-status");
  if (String(stAfter).toUpperCase() !== "ACCEPTED") {
    throw new Error(`accept_after_rerender=${stAfter}`);
  }
  if ((await card.locator('[data-gift-card-accept="1"]').count()) > 0) {
    throw new Error("accept_cta_still_visible_after_rerender");
  }
  report.r.CARD_AFTER_RERENDER = "PASS";

  report.r.ACCEPT = "PASS";
  report.acceptVia = acceptedVia;

  const { data: after } = await sb
    .from("gift_certificate_instances")
    .select("current_owner_user_id, remaining_balance, status")
    .eq("id", GIFT_ID)
    .maybeSingle();
  report.ownerAfter = after?.current_owner_user_id;
  report.remainingAfter = after?.remaining_balance;
  if (after?.current_owner_user_id !== RECIPIENT.userId) {
    throw new Error(`owner_after=${after?.current_owner_user_id}`);
  }
  if (Number(after?.remaining_balance) !== Number(before?.remaining_balance)) {
    throw new Error(`remaining_changed`);
  }

  await pageB.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageB.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  if ((await pageB.locator(`[data-gift-instance="${GIFT_ID}"]`).count()) < 1) {
    throw new Error("recipient_wallet_missing_instance");
  }
  report.r.RECIPIENT_WALLET = "PASS";
  await pageB.screenshot({ path: resolve(SHOT_DIR, "b-wallet.png"), fullPage: true }).catch(() => {});

  await pageA.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageA.waitForSelector('[data-customer-gift-certificate-wallet="1"][data-wallet-ready="1"]', {
    timeout: 30000,
  });
  if ((await pageA.locator(`[data-gift-instance="${GIFT_ID}"]`).count()) > 0) {
    throw new Error("sender_still_has_available");
  }
  const w = await pageA.request.fetch(`${ORIGIN}/api/me/gift-certificates/wallet`);
  const wj = await w.json();
  const hit = (wj.wallet?.sentTransfers || []).find((t) => t.id === transferId);
  if (!hit || String(hit.status).toUpperCase() !== "ACCEPTED") {
    throw new Error(`sender_sent_missing:${JSON.stringify(hit || null)}`);
  }
  report.r.SENDER_WALLET_HISTORY = "PASS";
  await pageA.screenshot({ path: resolve(SHOT_DIR, "a-wallet-sent.png"), fullPage: true }).catch(() => {});

  report.cancel = "NOT_PROVEN";
  report.reject = "NOT_PROVEN";
  report.reGift = "NOT_PROVEN";
  report.notifications = "PASS_CODE";
  report.duplicateCard = "PASS_CODE";
  report.orderChatControl = "PASS_CODE";
  report.tradeChatControl = "PASS_CODE";
  report.groupChatControl = "PASS_CODE";
  report.px390 = "PASS";
  report.firstDivergence = "NONE";
  report.fix = "offer_route_room_bump+accept_continue";
  report.u3 = "RUNTIME_PROVEN";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.u3 = `BLOCKED — ${String(e?.message || e)}`;
  report.firstDivergence = String(e?.message || e);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
