/**
 * DIBAY GIFT — RE-ENTRY ONE-SHOT DIAGNOSTIC (no product mutation, no force-scroll).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/gift-friend-reentry-oneshot-diagnostic.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-reentry-oneshot-diagnostic.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-reentry-oneshot-shots");
const VP = { width: 390, height: 844 };
const COMMIT = process.env.GIFT_PROOF_COMMIT?.trim() || "1bf849a4f";

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
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  // @supabase/ssr chunk size — oversized single cookie is dropped by browsers → AuthSessionBoundary stuck on Loading…
  const MAX_CHUNK = 3180;
  const raw = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  const cookies = [];
  const name = `sb-${ref}-auth-token`;
  if (raw.length <= MAX_CHUNK) {
    cookies.push({ ...base, name, value: raw });
  } else {
    const chunks = [];
    for (let i = 0; i < raw.length; i += MAX_CHUNK) chunks.push(raw.slice(i, i + MAX_CHUNK));
    chunks.forEach((value, i) => {
      cookies.push({ ...base, name: `${name}.${i}`, value });
    });
  }
  if (sessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: sessionId,
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
    });
  }
  return cookies;
}

function extractGiftFromMessages(messages, transferId, messageId) {
  if (!Array.isArray(messages)) return null;
  const byId = messageId ? messages.find((m) => String(m?.id || "") === messageId) : null;
  const byTransfer = messages.find((m) => {
    const meta = m?.metadata || m?.message_metadata || {};
    const tid = meta?.gift_transfer_id || meta?.transfer_id;
    return String(tid || "") === transferId;
  });
  const hit = byId || byTransfer;
  if (!hit) return null;
  const meta = hit.metadata || hit.message_metadata || {};
  const idx = messages.findIndex((m) => String(m?.id || "") === String(hit.id || ""));
  return {
    messageId: String(hit.id || ""),
    transferId: String(meta.gift_transfer_id || meta.transfer_id || ""),
    messageType: String(hit.message_type || hit.messageType || hit.type || ""),
    transferStatus: meta.transfer_status || meta.transferStatus || null,
    timelineIndex: idx,
    latestIndex: messages.length - 1,
    modelCount: messages.length,
  };
}

async function captureProbe(page, { transferId, messageId, label, modelBag }) {
  const at = Date.now();
  const client = await page.evaluate(
    ({ transferId, messageId }) => {
      const tipKey = "samarket:cm:room_tip_entry_consumed.v1";
      const pushKey = "samarket:cm:push_entry_intent.v1";
      const roomEntryKey = "samarket:cm:room_entry_intent.v1";
      const readJson = (k) => {
        try {
          return JSON.parse(sessionStorage.getItem(k) || "null");
        } catch {
          return sessionStorage.getItem(k);
        }
      };

      const vp = document.querySelector(".chat-timeline-scroll");
      const rows = Array.from(document.querySelectorAll("[data-cm-timeline-message-row][data-cm-message-id]"));
      const indexes = rows
        .map((r) => {
          const di = r.getAttribute("data-index");
          return di != null && di !== "" ? Number(di) : null;
        })
        .filter((n) => Number.isFinite(n));
      const rangeStart = indexes.length ? Math.min(...indexes) : null;
      const rangeEnd = indexes.length ? Math.max(...indexes) : null;
      const ids = rows.map((r) => r.getAttribute("data-cm-message-id"));
      const giftDomRow = messageId ? rows.find((r) => r.getAttribute("data-cm-message-id") === messageId) : null;
      const giftDataIndex = giftDomRow?.getAttribute("data-index");
      const giftInVirtualRange =
        giftDataIndex != null &&
        rangeStart != null &&
        rangeEnd != null &&
        Number(giftDataIndex) >= rangeStart &&
        Number(giftDataIndex) <= rangeEnd;

      const sel = `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${transferId}"]`;
      const cards = Array.from(document.querySelectorAll(sel));
      const card = cards[0] || null;
      let rect = null;
      let inViewport = false;
      let connected = false;
      if (card) {
        connected = card.isConnected;
        const cr = card.getBoundingClientRect();
        rect = { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right, width: cr.width, height: cr.height };
        if (vp) {
          const vr = vp.getBoundingClientRect();
          inViewport = cr.height > 0 && cr.bottom > vr.top + 2 && cr.top < vr.bottom - 2;
        }
      }

      const viewport = vp
        ? {
            scrollTop: vp.scrollTop,
            scrollHeight: vp.scrollHeight,
            clientHeight: vp.clientHeight,
            distanceFromBottom: Math.max(0, vp.scrollHeight - vp.scrollTop - vp.clientHeight),
          }
        : null;

      const virtualizerEl = vp?.querySelector("[style*='height']") || vp?.firstElementChild;
      let virtualizerTotalHint = null;
      if (virtualizerEl && virtualizerEl instanceof HTMLElement) {
        const h = virtualizerEl.style.height || getComputedStyle(virtualizerEl).height;
        const n = Number.parseFloat(h);
        if (Number.isFinite(n)) virtualizerTotalHint = n;
      }

      const bodyText = (document.body?.innerText || "").slice(0, 240);
      const cookieNames = document.cookie
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);

      return {
        pageUrl: location.href,
        bodyTextHead: bodyText,
        authBoundaryBlocked: Boolean(document.querySelector('[data-auth-session-boundary="blocked"]')),
        cookieNames,
        entry: {
          tipConsumed: readJson(tipKey),
          pushIntent: readJson(pushKey),
          roomEntryIntent: readJson(roomEntryKey),
        },
        virtualizer: {
          rowCountInDom: rows.length,
          rangeStart,
          rangeEnd,
          giftDataIndex: giftDataIndex != null ? Number(giftDataIndex) : null,
          giftInVirtualRange,
          giftMessageIdInDomRows: Boolean(giftDomRow),
          renderedIdsTail: ids.slice(-5),
          virtualizerTotalHint,
          hasTimelineScroll: Boolean(vp),
        },
        dom: {
          selector: sel,
          count: cards.length,
          connected,
          rect,
        },
        viewport: {
          ...viewport,
          cardInViewport: inViewport,
          atBottom: viewport ? viewport.distanceFromBottom <= 48 : null,
        },
      };
    },
    { transferId, messageId }
  );

  return {
    label,
    at,
    model: modelBag,
    ...client,
  };
}

async function uiLogin(page, email) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const entry = page.getByTestId("auth-internal-login-entry");
  if ((await entry.count()) > 0) {
    await entry.click();
    await page.waitForTimeout(500);
  }
  const panel = page.getByTestId("auth-internal-login-panel");
  await panel.waitFor({ state: "visible", timeout: 20000 });
  const inputs = panel.locator("input");
  await inputs.nth(0).fill(email);
  let lastErr = "ui_login_failed";
  for (const password of passwords()) {
    await inputs.nth(1).fill(password);
    const submit = panel.locator('button[type="submit"]');
    await submit.click();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      const url = page.url();
      if (!/\/login(?:\?|$)/.test(url)) return;
      const alert = await page.locator('[role="alert"]').textContent().catch(() => "");
      if (alert && /wrong|실패|invalid|비밀번호/i.test(alert)) {
        lastErr = `ui_login_alert:${alert.slice(0, 80)}`;
        break;
      }
    }
  }
  throw new Error(lastErr);
}

async function fetchHydratedModel(page, { roomId, transferId, messageId }) {
  const url = `${ORIGIN}/api/community-messenger/rooms/${encodeURIComponent(roomId)}/bootstrap?mode=instant&memberHydration=minimal&hydration=critical&messages=40`;
  const res = await page.request.fetch(url);
  const json = await res.json().catch(() => null);
  const messages =
    (Array.isArray(json?.messages) && json.messages) ||
    (Array.isArray(json?.payload?.messages) && json.payload.messages) ||
    (Array.isArray(json?.room?.messages) && json.room.messages) ||
    (Array.isArray(json?.snapshot?.messages) && json.snapshot.messages) ||
    [];
  const hit = extractGiftFromMessages(messages, transferId, messageId);
  return {
    httpStatus: res.status(),
    source: url,
    networkMessageCount: messages.length,
    fromNetworkBootstrapOrMessages: hit,
    unreadCount: json?.room?.unreadCount ?? json?.unreadCount ?? json?.participant?.unread_count ?? null,
    firstUnreadMessageId:
      json?.room?.firstUnreadMessageId ?? json?.firstUnreadMessageId ?? json?.participant?.first_unread_message_id ?? null,
  };
}

function classifySamples(samples) {
  const finals = samples.filter(Boolean);
  if (!finals.length) return { case: "NOT_PROVEN", detail: "no_samples" };

  const flags = finals.map((s) => {
    const modelOk = Boolean(s.model?.fromNetworkBootstrapOrMessages);
    const giftIdx = s.model?.fromNetworkBootstrapOrMessages?.timelineIndex;
    const latestIdx = s.model?.fromNetworkBootstrapOrMessages?.latestIndex;
    const inTotal =
      giftIdx != null && latestIdx != null ? giftIdx >= 0 && giftIdx <= latestIdx : s.virtualizer?.giftMessageIdInDomRows;
    const inRange = Boolean(s.virtualizer?.giftInVirtualRange || s.virtualizer?.giftMessageIdInDomRows);
    const domOk = (s.dom?.count || 0) > 0 && s.dom?.connected;
    const viewOk = Boolean(s.viewport?.cardInViewport);
    return { modelOk, inTotal, inRange, domOk, viewOk, at: s.at, label: s.label };
  });

  const passish = flags.filter((f) => f.domOk && f.viewOk);
  const failish = flags.filter((f) => !(f.domOk && f.viewOk));
  if (passish.length && failish.length) {
    const firstFail = failish[0];
    const firstPass = passish[0];
    return {
      case: "CASE_6_TIMING_TRANSITION",
      detail: `transition owner window: ${firstFail.label}@${firstFail.at} → ${firstPass.label}@${firstPass.at} (or reverse)`,
      flags,
    };
  }

  const last = flags[flags.length - 1];
  if (last.domOk && last.viewOk) {
    return { case: "STABLE_PASS", detail: "DOM+viewport OK on final sample (natural land)", flags };
  }
  if (!last.modelOk && !last.inRange) {
    // Prefer model absence when network never had gift
    const anyModel = flags.some((f) => f.modelOk);
    if (!anyModel) return { case: "CASE_1_MODEL_MISSING", detail: "gift absent from captured hydrated network model", flags };
  }
  if (last.modelOk && !last.inRange && !last.domOk) {
    return { case: "CASE_2_OUTSIDE_VIRTUAL_RANGE", detail: "model has gift; virtual range/DOM row missing", flags };
  }
  if (last.inRange && !last.domOk) {
    return { case: "CASE_3_ROW_WITHOUT_CARD", detail: "gift row in virtual/DOM rows but card selector missing", flags };
  }
  if (last.domOk && !last.viewOk) {
    return { case: "CASE_4_OUTSIDE_VIEWPORT", detail: "DOM card present but outside viewport", flags };
  }
  if (!last.modelOk) {
    return { case: "CASE_1_MODEL_MISSING", detail: "gift absent from network model on final sample", flags };
  }
  return { case: "NOT_PROVEN", detail: "could not map final flags to CASE 1–5", flags };
}

const report = {
  title: "DIBAY GIFT — RE-ENTRY ONE-SHOT DIAGNOSTIC",
  commit: COMMIT,
  productCodeChange: "NONE",
  forceScroll: false,
  transferId: null,
  messageId: null,
  roomId: null,
  firstEntrySamples: [],
  reEntrySamples: [],
  classification: null,
  case: null,
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: VP });
const ctxB = await browser.newContext({ viewport: VP });
const ownerPage = await ctxA.newPage();
const peerPage = await ctxB.newPage();
const consoleErrors = [];

try {
  const sb = sbService();

  let owner = SENDER;
  let peer = RECIPIENT;
  let oPage = ownerPage;
  let pPage = peerPage;
  let owned = (
    await sb
      .from("gift_certificate_instances")
      .select("id, remaining_balance, current_owner_user_id")
      .eq("current_owner_user_id", SENDER.userId)
      .in("status", ["ACTIVE", "PARTIALLY_REDEEMED"])
      .gt("remaining_balance", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ).data;
  if (!owned) {
    owned = (
      await sb
        .from("gift_certificate_instances")
        .select("id, remaining_balance, current_owner_user_id")
        .eq("current_owner_user_id", RECIPIENT.userId)
        .in("status", ["ACTIVE", "PARTIALLY_REDEEMED"])
        .gt("remaining_balance", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;
    if (!owned) throw new Error("no_fixture");
    owner = RECIPIENT;
    peer = SENDER;
    oPage = peerPage;
    pPage = ownerPage;
  }
  report.fixture = { ownerUserId: owner.userId, peerUserId: peer.userId, instanceId: owned.id };

  pPage.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
  pPage.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const failedReqs = [];
  pPage.on("response", (res) => {
    if (res.status() >= 400) {
      failedReqs.push({ status: res.status(), url: res.url().slice(0, 180) });
    }
  });

  {
    const { data: pending } = await sb
      .from("gift_certificate_transfers")
      .select("id")
      .eq("instance_id", owned.id)
      .eq("status", "PENDING")
      .maybeSingle();
    if (pending?.id) {
      await sb.rpc("gift_certificate_cancel", {
        p_sender_user_id: owner.userId,
        p_transfer_id: pending.id,
      });
    }
  }

  // UI login — cookie injection alone currently leaves AuthSessionBoundary on Loading…
  await uiLogin(oPage, owner.email);
  await uiLogin(pPage, peer.email);

  const roomRes = await oPage.request.fetch(`${ORIGIN}/api/community-messenger/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ roomType: "direct", peerUserId: peer.userId }),
  });
  const roomJson = await roomRes.json().catch(() => ({}));
  const roomId = String(roomJson?.roomId || "").trim();
  if (!roomId) throw new Error(`room_failed:${JSON.stringify(roomJson)}`);
  report.roomId = roomId;

  const offerRes = await oPage.request.fetch(`${ORIGIN}/api/me/gift-certificates/transfers/offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({
      instanceId: owned.id,
      recipientUserId: peer.userId,
      roomId,
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  const offerJson = await offerRes.json().catch(() => ({}));
  if (!offerJson?.ok) throw new Error(`offer:${JSON.stringify(offerJson)}`);
  const transferId = String(offerJson.transfer_id ?? offerJson.id ?? "").trim();
  report.transferId = transferId;
  const { data: trow } = await sb
    .from("gift_certificate_transfers")
    .select("messenger_message_id, status")
    .eq("id", transferId)
    .maybeSingle();
  const messageId = String(trow?.messenger_message_id || "").trim();
  report.messageId = messageId;

  // DB ground truth for message
  const { data: msgRow } = await sb
    .from("community_messenger_messages")
    .select("id, message_type, metadata, created_at")
    .eq("id", messageId)
    .maybeSingle();
  report.dbMessage = msgRow || null;
  write();

  async function sample(label) {
    const modelBag = await fetchHydratedModel(pPage, { roomId, transferId, messageId });
    const authSessionRes = await pPage.request.fetch(`${ORIGIN}/api/auth/session`);
    const authSessionText = await authSessionRes.text().catch(() => "");
    const snap = await captureProbe(pPage, { transferId, messageId, label, modelBag });
    snap.authSessionApi = {
      status: authSessionRes.status(),
      bodyHead: authSessionText.slice(0, 180),
    };
    return snap;
  }

  // FIRST ENTRY — observational only (no force-scroll)
  await pPage.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pPage.waitForSelector(".chat-timeline-scroll, [data-cm-timeline-message-row]", { timeout: 45000 }).catch(() => null);
  for (const ms of [1500, 3500]) {
    await pPage.waitForTimeout(ms === 1500 ? 1500 : 2000);
    report.firstEntrySamples.push(await sample(`first_entry_t${ms}ms`));
    write();
  }
  await pPage.screenshot({ path: resolve(SHOT, "01-first-entry.png"), fullPage: false }).catch(() => {});

  await pPage.goto(`${ORIGIN}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pPage.waitForTimeout(1000);

  // RE-ENTRY — observational sampling, NO scroll write
  await pPage.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pPage.waitForSelector(".chat-timeline-scroll, [data-cm-timeline-message-row]", { timeout: 45000 }).catch(() => null);
  // Shorter re-entry window if auth shell is blocked (not a gift CASE)
  const samplePlan = [500, 1500, 3000, 8000, 15000];
  let elapsed = 0;
  for (const t of samplePlan) {
    await pPage.waitForTimeout(t - elapsed);
    elapsed = t;
    report.reEntrySamples.push(await sample(`re_entry_hard_t${t}ms`));
    write();
  }

  // Natural re-entry control: list → click same room (SPA), no force-scroll
  await pPage.goto(`${ORIGIN}/community-messenger`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await pPage.waitForTimeout(2000);
  const clicked = await pPage.evaluate((rid) => {
    const href = `/community-messenger/rooms/${rid}`;
    const a = Array.from(document.querySelectorAll("a[href]")).find((el) => {
      const h = el.getAttribute("href") || "";
      return h === href || h.endsWith(href);
    });
    if (a) {
      a.click();
      return { ok: true, href: a.getAttribute("href") };
    }
    return { ok: false, href: null };
  }, roomId);
  report.listClick = clicked;
  if (clicked.ok) {
    await pPage.waitForTimeout(4000);
    report.reEntryClickSample = await sample("re_entry_list_click_t4s");
  } else {
    // fallback soft navigate via history
    await pPage.evaluate((rid) => {
      history.pushState({}, "", `/community-messenger/rooms/${rid}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, roomId);
    await pPage.waitForTimeout(4000);
    report.reEntryClickSample = await sample("re_entry_pushstate_t4s");
  }
  await pPage.screenshot({ path: resolve(SHOT, "02-re-entry.png"), fullPage: false }).catch(() => {});

  const { data: part } = await sb
    .from("community_messenger_participants")
    .select("unread_count, last_read_message_id")
    .eq("room_id", roomId)
    .eq("user_id", peer.userId)
    .maybeSingle();
  report.participant = part || null;
  report.consoleErrors = consoleErrors.slice(0, 20);
  report.failedReqs = failedReqs.slice(-30);

  const classifHard = classifySamples(report.reEntrySamples);
  const clickSample = report.reEntryClickSample;
  const clickOk = Boolean(clickSample?.dom?.count > 0 && clickSample?.viewport?.cardInViewport);
  const hardLast = report.reEntrySamples[report.reEntrySamples.length - 1];
  const hardAuthBlocked = Boolean(hardLast?.authBoundaryBlocked);
  const hardOk = Boolean(hardLast?.dom?.count > 0 && hardLast?.viewport?.cardInViewport);

  if (hardAuthBlocked && clickOk) {
    report.case = "CASE_6_TIMING_OR_NAV_AUTH_HOLD";
    report.classification = {
      case: "CASE_6_TIMING_OR_NAV_AUTH_HOLD",
      detail:
        "hard goto room re-entry stuck on AuthSessionBoundary Loading while /api/auth/session=200; list-click SPA re-entry shows gift card",
      hard: classifHard,
      clickOk: true,
    };
  } else if (hardAuthBlocked && !clickOk && clickSample?.authBoundaryBlocked) {
    report.case = "CASE_AUTH_BOUNDARY_REENTRY";
    report.classification = {
      case: "CASE_AUTH_BOUNDARY_REENTRY",
      detail: "AuthSessionBoundary blocked on re-entry despite session API 200 — gift DOM unreachable",
      hard: classifHard,
      clickOk: false,
    };
  } else if (hardOk) {
    report.case = "STABLE_PASS";
    report.classification = classifHard;
  } else {
    report.classification = classifHard;
    report.case = classifHard.case;
  }

  if (
    report.case !== "CASE_6_TIMING_OR_NAV_AUTH_HOLD" &&
    report.case !== "CASE_AUTH_BOUNDARY_REENTRY" &&
    !hardLast?.virtualizer?.hasTimelineScroll &&
    /Loading/i.test(String(hardLast?.bodyTextHead || ""))
  ) {
    report.case = "DIAGNOSTIC_INVALID_ROOM_NOT_HYDRATED";
    report.classification = {
      case: "DIAGNOSTIC_INVALID_ROOM_NOT_HYDRATED",
      detail: "room shell stuck on Loading — not a product CASE 1–6",
      flags: classifHard.flags,
    };
  }

  write();
  console.log(
    JSON.stringify(
      {
        case: report.case,
        detail: report.classification?.detail,
        transferId,
        messageId,
        roomId,
        firstDom: report.firstEntrySamples.at(-1)?.dom?.count,
        hardDom: hardLast?.dom?.count,
        hardAuthBlocked,
        clickDom: clickSample?.dom?.count,
        clickView: clickSample?.viewport?.cardInViewport,
        clickAuthBlocked: clickSample?.authBoundaryBlocked,
        modelOk: Boolean(hardLast?.model?.fromNetworkBootstrapOrMessages),
      },
      null,
      2
    )
  );
} catch (e) {
  report.case = "AUDIT_ERROR";
  report.classification = { case: "AUDIT_ERROR", detail: e instanceof Error ? e.message : String(e) };
  write();
  console.error(report.classification.detail);
  process.exitCode = 1;
} finally {
  await browser.close();
}
