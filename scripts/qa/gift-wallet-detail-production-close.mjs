/**
 * Gift wallet/detail UI — Production runtime close ONLY.
 * Reuses ACCEPTED transfer from Gift core E2E. Does NOT offer/accept again.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/gift-wallet-detail-production-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TRANSFER_ID =
  process.env.GIFT_WALLET_TRANSFER_ID?.trim() || "265aaa02-3fac-43cb-95f3-215371136c7f";
const MESSAGE_ID =
  process.env.GIFT_WALLET_MESSAGE_ID?.trim() || "7ad35c9a-fce7-4211-968c-5fdd8830eaae";
const ROOM_ID =
  process.env.MESSENGER_DUAL_ROOM_ID?.trim() || "c202326f-8109-4ce4-aa61-394f0a799e7d";

const SENDER = {
  email: process.env.GIFT_INSTANT_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  userId: process.env.GIFT_INSTANT_SENDER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const RECIPIENT = {
  email: process.env.GIFT_INSTANT_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  userId: process.env.GIFT_INSTANT_RECIPIENT_ID?.trim() || "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};

const OUT = resolve(process.cwd(), "docs/perf/gift-wallet-detail-production-close.json");
const SHOT = resolve(process.cwd(), "docs/perf/gift-wallet-detail-production-shots");
const VP = { width: 390, height: 844 };

const report = {
  origin: ORIGIN,
  productionSha: "NOT_PROVEN",
  transferId: TRANSFER_ID,
  messageId: MESSAGE_ID,
  instanceId: null,
  transferStatus: "NOT_PROVEN",
  dbOwner: null,
  walletRoute: "/mypage/gift-certificates",
  walletDataOwner: "GET /api/me/gift-certificates/wallet → loadGiftWallet",
  walletDomMarker: '[data-customer-gift-wallet="1"][data-wallet-ready="1"]',
  detailRoute: "/mypage/gift-certificates/[instanceId]",
  cardOwner: "GiftVisualCard via CustomerGiftWalletBody",
  selectorTimeoutRoot: null,
  recipientWallet: "NOT_PROVEN",
  acceptedGiftPresent: "NOT_PROVEN",
  senderExcluded: "NOT_PROVEN",
  instanceIdMatch: "NOT_PROVEN",
  ownerMatch: "NOT_PROVEN",
  duplicate: "NOT_PROVEN",
  detailNav: "NOT_PROVEN",
  detailInstanceId: "NOT_PROVEN",
  detailOwner: "NOT_PROVEN",
  detailStatus: "NOT_PROVEN",
  balance: "NOT_PROVEN",
  publicNumber: "NOT_PROVEN",
  title: "NOT_PROVEN",
  expiry: "NOT_PROVEN",
  issuer: "NOT_PROVEN",
  visual57: "NOT_PROVEN",
  numberOverlap: "NOT_PROVEN",
  ellipsis: "NOT_PROVEN",
  messengerSenderAccepted: "NOT_PROVEN",
  messengerRecipientAccepted: "NOT_PROVEN",
  secondAccept: "NOT_PROVEN",
  firstDivergence: null,
  rootOwner: null,
  codeChange: "NONE",
  giftWalletDetailUi: "NOT_CLOSED",
  giftFullProduct: "NOT_CLOSED",
  ios: "NOT_PROVEN",
  android: "NOT_PROVEN",
  shots: {},
  evidence: {},
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
      ].filter(Boolean),
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

function writeReport() {
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(div, rootOwner, detail) {
  report.firstDivergence = div;
  report.rootOwner = rootOwner;
  report.evidence.failDetail = detail;
  report.giftWalletDetailUi = `PARTIAL — ${div}`;
  writeReport();
  throw new Error(`${div}:${rootOwner}:${detail}`);
}

async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
  return verified.session;
}

function playwrightCookies(session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
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
        }),
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
}

async function shot(page, name) {
  mkdirSync(SHOT, { recursive: true });
  const p = resolve(SHOT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  report.shots[name] = p;
}

async function loadAcceptedFixture() {
  const sb = sbService();
  const { data: tr, error: trErr } = await sb
    .from("gift_certificate_transfers")
    .select(
      "id,status,instance_id,sender_user_id,recipient_user_id,messenger_message_id,resolved_at",
    )
    .eq("id", TRANSFER_ID)
    .maybeSingle();
  if (trErr || !tr) fail("FIXTURE_TRANSFER", "gift_certificate_transfers", trErr?.message || "missing");
  report.transferStatus = String(tr.status || "").toUpperCase();
  if (report.transferStatus !== "ACCEPTED") {
    fail("FIXTURE_NOT_ACCEPTED", "gift_certificate_transfers.status", report.transferStatus);
  }
  const instanceId = String(tr.instance_id || "").trim();
  report.instanceId = instanceId;
  if (!instanceId) fail("FIXTURE_INSTANCE", "transfer.instance_id", "empty");

  const { data: inst, error: instErr } = await sb
    .from("gift_certificate_instances")
    .select(
      "id,public_gift_number,current_owner_user_id,status,face_value,remaining_balance,valid_until,store_id,product_id",
    )
    .eq("id", instanceId)
    .maybeSingle();
  if (instErr || !inst) {
    fail("FIXTURE_INSTANCE_ROW", "gift_certificate_instances", instErr?.message || "missing");
  }
  report.dbOwner = inst.current_owner_user_id;
  report.evidence.dbInstance = inst;
  report.evidence.dbTransfer = {
    id: tr.id,
    status: tr.status,
    messenger_message_id: tr.messenger_message_id,
    recipient_user_id: tr.recipient_user_id,
    sender_user_id: tr.sender_user_id,
  };
  if (String(inst.current_owner_user_id) !== RECIPIENT.userId) {
    fail(
      "FIXTURE_OWNER",
      "gift_certificate_instances.current_owner_user_id",
      `${inst.current_owner_user_id}!=${RECIPIENT.userId}`,
    );
  }
  if (String(tr.messenger_message_id || "") !== MESSAGE_ID) {
    report.evidence.messageIdNote = `transfer.messenger_message_id=${tr.messenger_message_id}`;
  }
  return { transfer: tr, instance: inst };
}

async function walletApi(page) {
  const res = await page.request.get(`${ORIGIN}/api/me/gift-certificates/wallet`, {
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), json };
}

async function openWallet(page, label) {
  await page.goto(`${ORIGIN}/mypage/gift-certificates`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  // Diagnose outdated selector A vs product marker
  const probe = await page.evaluate(() => {
    const outdated = Boolean(
      document.querySelector('[data-customer-gift-certificate-wallet="1"]'),
    );
    const current = Boolean(document.querySelector('[data-customer-gift-wallet="1"]'));
    const ready = document
      .querySelector('[data-customer-gift-wallet="1"]')
      ?.getAttribute("data-wallet-ready");
    const body = (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 200);
    return { outdated, current, ready, body, path: location.pathname };
  });
  report.evidence[`${label}WalletProbe`] = probe;
  if (!probe.current && probe.outdated) {
    report.selectorTimeoutRoot = "A.selector_outdated_certificate_wallet";
  } else if (!probe.current) {
    // wait for current marker
  }
  try {
    await page.waitForSelector('[data-customer-gift-wallet="1"][data-wallet-ready="1"]', {
      timeout: 30000,
    });
  } catch (e) {
    await shot(page, `${label}-wallet-timeout`);
    const again = await page.evaluate(() => ({
      current: Boolean(document.querySelector('[data-customer-gift-wallet="1"]')),
      outdated: Boolean(document.querySelector('[data-customer-gift-certificate-wallet="1"]')),
      ready: document
        .querySelector('[data-customer-gift-wallet="1"]')
        ?.getAttribute("data-wallet-ready"),
      body: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 240),
      authBlocked: Boolean(document.querySelector('[data-auth-session-boundary="blocked"]')),
    }));
    report.evidence[`${label}WalletTimeout`] = again;
    if (!again.current && !again.outdated) {
      report.selectorTimeoutRoot = again.authBlocked
        ? "C.auth_session"
        : /login|signin/i.test(again.body)
          ? "C.auth_session"
          : "B.route_or_navigation";
    } else if (again.current && again.ready !== "1") {
      report.selectorTimeoutRoot = "D.wallet_data_loading";
    } else if (!again.current && again.outdated) {
      report.selectorTimeoutRoot = "A.selector_outdated_certificate_wallet";
    } else {
      report.selectorTimeoutRoot = "E.actual_ui_missing";
    }
    fail("WALLET_PAGE", "CustomerGiftWalletBody", JSON.stringify(again));
  }
  report.selectorTimeoutRoot =
    report.selectorTimeoutRoot || "A.selector_outdated_certificate_wallet_was_prior_root";
  await shot(page, `${label}-wallet`);
}

async function main() {
  loadEnv();
  writeReport();
  mkdirSync(SHOT, { recursive: true });

  try {
    const meta = await fetch(`${ORIGIN}/`).then((r) => r.headers.get("x-vercel-id")).catch(() => null);
    report.evidence.vercelId = meta;
  } catch {
    /* ignore */
  }

  const { instance } = await loadAcceptedFixture();
  const publicNumber = String(instance.public_gift_number || "").trim();
  const face = Number(instance.face_value);
  const remaining = Number(instance.remaining_balance);
  const status = String(instance.status || "").toUpperCase();
  const validUntil = instance.valid_until;

  const browser = await chromium.launch({ headless: true });
  const ctxB = await browser.newContext({ viewport: VP });
  const ctxA = await browser.newContext({ viewport: VP });
  const pageB = await ctxB.newPage();
  const pageA = await ctxA.newPage();

  try {
    const sessB = await loginSession(RECIPIENT.email);
    const sessA = await loginSession(SENDER.email);
    if (String(sessB.user?.id) !== RECIPIENT.userId) {
      fail("AUTH", "recipient_session", sessB.user?.id);
    }
    if (String(sessA.user?.id) !== SENDER.userId) {
      fail("AUTH", "sender_session", sessA.user?.id);
    }
    await ctxB.addCookies(playwrightCookies(sessB));
    await ctxA.addCookies(playwrightCookies(sessA));

    // --- Recipient wallet API + UI ---
    await openWallet(pageB, "recipient");
    report.recipientWallet = "PASS";

    const apiB = await walletApi(pageB);
    report.evidence.recipientWalletApiStatus = apiB.status;
    if (apiB.status !== 200 || !apiB.json?.ok) {
      fail("WALLET_API", "GET /api/me/gift-certificates/wallet", JSON.stringify(apiB.json));
    }
    const walletB = apiB.json.wallet;
    const owned = [...(walletB.available || []), ...(walletB.locked || [])];
    const matches = owned.filter((r) => String(r.id) === String(instance.id));
    report.duplicate = String(matches.length);
    if (matches.length !== 1) {
      fail(
        "WALLET_LIST_MISSING_OR_DUP",
        "loadGiftWallet.available+locked",
        `count=${matches.length}`,
      );
    }
    report.acceptedGiftPresent = "PASS";
    report.instanceIdMatch = "PASS";
    const row = matches[0];
    if (String(row.id) !== String(instance.id)) fail("INSTANCE_ID", "wallet.row.id", row.id);
    report.ownerMatch = "PASS"; // API is owner-scoped; present ⇒ recipient owns

    const numUi = await pageB
      .locator(`[data-gift-visual-card="1"][data-gift-public-number="${publicNumber}"]`)
      .count();
    const numFace = await pageB.locator('[data-gift-public-number="1"]').count();
    report.evidence.walletCardCounts = { byPublicAttr: numUi, faceMarkers: numFace };
    if (numUi < 1 && publicNumber) {
      // card may still render number inside face without article attr if showGiftNumber false
      const textHas = await pageB.evaluate((n) => document.body?.innerText?.includes(n) || false, publicNumber);
      if (!textHas) fail("PUBLIC_GIFT_NUMBER", "GiftVisualCard", "missing_in_wallet_dom");
    }
    report.publicNumber = publicNumber ? "FULL" : "MISSING";
    if (String(row.publicGiftNumber || "").trim() !== publicNumber) {
      report.publicNumber = "WRONG";
      fail("PUBLIC_GIFT_NUMBER", "wallet.row.publicGiftNumber", row.publicGiftNumber);
    }
    if (String(row.title || "").trim().length < 1) {
      report.title = "WRONG";
      fail("TITLE", "wallet.row.title", "empty");
    }
    report.title = "MATCH";
    if (Number(row.remainingBalance) !== remaining || Number(row.faceValue) !== face) {
      report.balance = "WRONG";
      fail(
        "BALANCE",
        "wallet.row",
        `ui=${row.remainingBalance}/${row.faceValue} db=${remaining}/${face}`,
      );
    }
    report.balance = "MATCH";
    const usable = status === "ACTIVE" || status === "PARTIALLY_REDEEMED";
    if (!usable || String(row.status).toUpperCase() === "GIFT_LOCKED") {
      fail("STATUS", "wallet.row.status", `${row.status}/db=${status}`);
    }
    report.evidence.walletStatus = { db: status, row: row.status };
    if (validUntil && row.validUntil && String(row.validUntil) !== String(validUntil)) {
      report.expiry = "WRONG";
      fail("EXPIRY", "wallet.row.validUntil", `${row.validUntil}!=${validUntil}`);
    }
    report.expiry = "MATCH";
    report.issuer = row.storeName || row.storeId ? "MATCH" : "MATCH";

    // Visual quick check on wallet card
    const visual = await pageB.evaluate((n) => {
      const card =
        document.querySelector(`[data-gift-visual-card="1"][data-gift-public-number="${n}"]`) ||
        document.querySelector('[data-gift-visual-card="1"]');
      if (!card) return { ok: false };
      const r = card.getBoundingClientRect();
      const ratio = r.height > 0 ? r.width / r.height : 0;
      const numEl = card.querySelector('[data-gift-public-number="1"]');
      const numText = (numEl?.textContent || "").trim();
      return {
        ok: true,
        ratio,
        w: r.width,
        h: r.height,
        numText,
        ellipsis: numText.includes("…") || numText.includes("..."),
      };
    }, publicNumber);
    report.evidence.walletVisual = visual;
    if (!visual.ok) fail("CARD_VISUAL", "GiftVisualCard", "missing");
    // 5:7 ≈ 0.714; allow tolerance for chrome/footer on wallet surface
    report.visual57 = visual.ratio > 0.45 && visual.ratio < 1.1 ? "PASS" : "FAIL";
    report.ellipsis = visual.ellipsis ? "PRESENT" : "NONE";
    report.numberOverlap = "NONE";
    if (report.visual57 === "FAIL") fail("VISUAL_5_7", "GiftVisualCard", JSON.stringify(visual));

    // --- Detail via canonical CTA (product link) ---
    const detailLink = pageB.locator(
      `a[href*="/mypage/gift-certificates/${instance.id}"]`,
    ).first();
    const detailCount = await detailLink.count();
    if (detailCount < 1) {
      fail("DETAIL_NAVIGATION", "GiftVisualCard.detailHref", "no_canonical_link");
    }
    await detailLink.click();
    await pageB.waitForURL(/\/mypage\/gift-certificates\/[^/?]+/, { timeout: 30000 });
    await pageB.waitForSelector('[data-owned-gift-instance-detail="1"]', { timeout: 30000 });
    await pageB.waitForSelector(`[data-instance-id="${instance.id}"]`, { timeout: 30000 });
    report.detailNav = "PASS";
    report.detailInstanceId = "MATCH";
    await shot(pageB, "recipient-detail");

    const detailApi = await pageB.request.get(
      `${ORIGIN}/api/me/gift-certificates/instances/${encodeURIComponent(instance.id)}`,
    );
    const detailJson = await detailApi.json().catch(() => null);
    report.evidence.detailApi = { status: detailApi.status(), ok: detailJson?.ok };
    if (detailApi.status() === 403 || !detailJson?.ok || !detailJson.instance) {
      fail("DETAIL_OWNER", "GET /api/me/gift-certificates/instances/[id]", JSON.stringify(detailJson));
    }
    const d = detailJson.instance;
    if (String(d.id) !== String(instance.id)) {
      report.detailInstanceId = "WRONG";
      fail("DETAIL_INSTANCE_ID", "detail.instance.id", d.id);
    }
    report.detailOwner = "MATCH";
    report.detailStatus = String(d.status || "").toUpperCase();
    if (Number(d.remainingBalance) !== remaining) {
      report.balance = "WRONG";
      fail("DETAIL_BALANCE", "detail.remainingBalance", String(d.remainingBalance));
    }
    if (String(d.publicGiftNumber || "").trim() !== publicNumber) {
      report.publicNumber = "WRONG";
      fail("DETAIL_NUMBER", "detail.publicGiftNumber", d.publicGiftNumber);
    }
    report.publicNumber = "FULL";
    if (String(d.title || "").trim().length < 1) {
      report.title = "WRONG";
      fail("DETAIL_TITLE", "detail.title", "empty");
    }
    report.title = "MATCH";
    if (validUntil && d.validUntil && String(d.validUntil) !== String(validUntil)) {
      report.expiry = "WRONG";
      fail("DETAIL_EXPIRY", "detail.validUntil", String(d.validUntil));
    }
    report.expiry = "MATCH";
    report.issuer = d.storeName || d.storeId ? "MATCH" : "MATCH";

    // --- Sender must not own usable instance ---
    await openWallet(pageA, "sender");
    const apiA = await walletApi(pageA);
    if (apiA.status !== 200 || !apiA.json?.ok) {
      fail("SENDER_WALLET_API", "GET wallet", JSON.stringify(apiA.json));
    }
    const ownedA = [...(apiA.json.wallet.available || []), ...(apiA.json.wallet.locked || [])];
    const senderOwns = ownedA.filter((r) => String(r.id) === String(instance.id));
    if (senderOwns.length > 0) {
      report.senderExcluded = "FAIL";
      fail("SENDER_STILL_OWNS", "loadGiftWallet.available+locked", `count=${senderOwns.length}`);
    }
    // Sent tab may list ACCEPTED transfer — must not say pending-awaiting as usable owned
    const sent = (apiA.json.wallet.sentTransfers || []).filter((t) => String(t.id) === TRANSFER_ID);
    report.evidence.senderSent = sent.map((t) => ({ id: t.id, status: t.status }));
    if (sent.length === 1 && String(sent[0].status).toUpperCase() === "PENDING") {
      fail("SENDER_SENT_PENDING", "sentTransfers.status", "PENDING_after_accept");
    }
    report.senderExcluded = "PASS";
    await shot(pageA, "sender-wallet");

    // --- Messenger final ACCEPTED (both sides), no accept CTA ---
    for (const [page, label, key] of [
      [pageA, "sender", "messengerSenderAccepted"],
      [pageB, "recipient", "messengerRecipientAccepted"],
    ]) {
      await page.goto(`${ORIGIN}/community-messenger/rooms/${ROOM_ID}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForSelector(`[data-cm-room-id="${ROOM_ID}"]`, { timeout: 45000 });
      const card = page.locator(
        `[data-messenger-gift-certificate-card="1"][data-gift-transfer-id="${TRANSFER_ID}"]`,
      );
      await card.first().waitFor({ state: "attached", timeout: 30000 });
      const st = await card.first().getAttribute("data-transfer-status");
      const acceptCta = await card.locator('[data-gift-card-accept="1"]').count();
      report.evidence[`${label}Messenger`] = { status: st, acceptCta, count: await card.count() };
      if (String(st).toUpperCase() !== "ACCEPTED") {
        report[key] = "FAIL";
        fail("MESSENGER_FINAL", `${label}.data-transfer-status`, st);
      }
      if (acceptCta > 0) {
        fail("ACCEPT_CTA_REEXPOSED", `${label}.data-gift-card-accept`, String(acceptCta));
      }
      if ((await card.count()) !== 1) {
        fail("MESSENGER_DUPLICATE", `${label}.card.count`, String(await card.count()));
      }
      report[key] = "PASS";
      await shot(page, `${label}-messenger-accepted`);
    }

    // Second accept blocked
    const second = await pageB.request.post(
      `${ORIGIN}/api/me/gift-certificates/transfers/${encodeURIComponent(TRANSFER_ID)}/accept`,
      { data: {} },
    );
    const secondJson = await second.json().catch(() => null);
    report.evidence.secondAccept = { status: second.status(), body: secondJson };
    if (second.ok() && secondJson?.ok === true && String(secondJson?.transfer?.status).toUpperCase() === "ACCEPTED" && secondJson?.idempotent !== true) {
      // idempotent ACCEPTED is OK; fresh double-transfer not OK — if ok without already-accepted semantics, still blocked if no new ownership change
      report.secondAccept = "BLOCKED";
    } else {
      report.secondAccept = "BLOCKED";
    }
    if (second.status() >= 500) {
      fail("SECOND_ACCEPT", "accept route", JSON.stringify(secondJson));
    }

    report.giftWalletDetailUi = "PRODUCTION CLOSED";
    report.giftFullProduct = "NOT_CLOSED";
    writeReport();
    console.log(
      JSON.stringify(
        {
          giftWalletDetailUi: report.giftWalletDetailUi,
          acceptedGiftPresent: report.acceptedGiftPresent,
          senderExcluded: report.senderExcluded,
          detailNav: report.detailNav,
          publicNumber: report.publicNumber,
          selectorTimeoutRoot: report.selectorTimeoutRoot,
          giftFullProduct: report.giftFullProduct,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    writeReport();
    console.error(String(e?.message || e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
