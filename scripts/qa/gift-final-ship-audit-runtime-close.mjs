#!/usr/bin/env node
/**
 * DIBAY Gift Certificate — FINAL SHIP AUDIT remaining P0 runtime close.
 * Authority tip: 189031f69 / Production alias.
 *
 * Closes: CART_APPLY_390 · RECEIVED_390 · MESSENGER_CHAT_SM
 * Prefer one safe QA gift send (wwww → qqqq) for B+C.
 * No product code changes. No DB ownership/status fabrications.
 *
 *   PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *     scripts/qa/gift-final-ship-audit-runtime-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp/gift-final-ship-audit");
const FORBIDDEN_NUM = "GFT-LB3VZ-RTCU6";
const STORE = {
  id: process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: process.env.GIFT_QA_STORE_SLUG || "aa11",
  name: process.env.GIFT_QA_STORE_NAME || "나의 오른손딸방",
};
const PRODUCT = {
  id: process.env.GIFT_QA_CART_PRODUCT_ID || "7929c806-4f49-4e91-98d8-43304e026134",
  title: "매운 라면의 아름 다운 밤 입니다.",
  unitPhp: 2000,
};
const SENDER = {
  email: process.env.GIFT_QA_BUYER_EMAIL || "wwww@manual.local",
  userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
const RECIPIENT = {
  email: process.env.GIFT_QA_RECIPIENT_EMAIL || "qqqq@manual.local",
  userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
  label: "q테스트1",
};
const ROOM_ID = process.env.GIFT_QA_MESSENGER_ROOM_ID || "c202326f-8109-4ce4-aa61-394f0a799e7d";

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
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean)
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
  throw new Error(`login_failed:${email}`);
}

function cookieList(session) {
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
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ];
}

function analyze(html, text) {
  const modern = html.includes('data-gift-cert-identity="modern-ticket"');
  const face = html.includes('data-gift-cert-face="1"');
  const visualCard = html.includes('data-gift-visual-card="1"');
  const noBalance =
    !html.includes("data-gift-remaining-amount") &&
    !/\n\s*잔액\s/.test(text) &&
    !text.includes("gift_u4_cart_remaining") &&
    !/(^|\n)\s*Remaining balance\s/.test(text);
  const noLegacy =
    !html.includes("GiftArtwork") &&
    !html.includes('data-gift-hero-identity-slot="1"') &&
    !html.includes("Powered by DIBAY");
  return {
    MODERN_FACE: modern && face ? "PASS" : "FAIL",
    BRAND_RAIL: html.includes('data-gift-brand-rail="1"') ? "PASS" : "FAIL",
    NO_BALANCE: noBalance ? "PASS" : "FAIL",
    LEGACY_CARD: noLegacy && visualCard ? "PASS" : "FAIL",
    CURRENT_RAIL_LOGO:
      html.includes('data-gift-platform-mark="1"') || html.includes('data-gift-brand-wordmark="1"')
        ? "PASS"
        : "FAIL",
    STORE_MARK:
      html.includes('data-gift-store-logo="1"') || html.includes('data-gift-store-initial="1"')
        ? "PASS"
        : html.includes('data-gift-scope="STORE"')
          ? "FAIL"
          : "N/A",
    STORE_GUIDANCE: html.includes('data-gift-store-scope-notice="1"')
      ? "PASS"
      : html.includes('data-gift-scope="STORE"')
        ? "FAIL"
        : "N/A",
    FACE_SM: html.includes('data-gift-face-size="sm"') ? "PASS" : "N/A",
    NUMBER_STACKED: html.includes('data-gift-cert-number-row="stacked"') ? "PASS" : "N/A",
    visualCard,
    modern,
  };
}

function rollup(c) {
  return c.MODERN_FACE === "PASS" && c.NO_BALANCE === "PASS" && c.LEGACY_CARD === "PASS" ? "PASS" : "FAIL";
}

async function shot(page, name) {
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

function deployInfo() {
  try {
    const out = execSync(`npx vercel inspect ${ORIGIN} 2>&1`, { encoding: "utf8", maxBuffer: 2e6 });
    return {
      id: (out.match(/id\s+(dpl_[A-Za-z0-9]+)/) || [])[1] || null,
      status: (out.match(/status\s+●\s+(\w+)/) || [])[1] || null,
      url: (out.match(/url\s+(\S+)/) || [])[1] || null,
      metaSha: (out.match(/githubCommitSha\s+(\S+)/) || [])[1] || null,
    };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

async function proveSafeQaGift(sb) {
  const { data, error } = await sb
    .from("gift_certificate_instances")
    .select(
      "id, public_gift_number, status, remaining_balance, face_value, current_owner_user_id, purchaser_user_id, store_id, gift_scope, created_at"
    )
    .eq("current_owner_user_id", SENDER.userId)
    .eq("purchaser_user_id", SENDER.userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`safe_gift_query:${error.message}`);
  const hit = (data || []).find(
    (r) =>
      r.public_gift_number !== FORBIDDEN_NUM &&
      Number(r.remaining_balance) === Number(r.face_value) &&
      Number(r.remaining_balance) > 0 &&
      (r.store_id === STORE.id || String(r.gift_scope).toUpperCase() === "PLATFORM")
  );
  if (!hit) return { ok: false, blocker: "no_safe_QA_ACTIVE_gift_for_sender" };
  return {
    ok: true,
    gift: {
      id: hit.id,
      publicGiftNumber: hit.public_gift_number,
      faceValue: hit.face_value,
      remainingBalance: hit.remaining_balance,
      status: hit.status,
      owner: hit.current_owner_user_id,
      purchaser: hit.purchaser_user_id,
      storeId: hit.store_id,
      scope: hit.gift_scope,
    },
  };
}

async function seedCart(page) {
  await page.goto(`${ORIGIN}/stores/${encodeURIComponent(STORE.slug)}/cart`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.evaluate(
    ({ store, product }) => {
      const snap = {
        v: 2,
        touchedAtMs: Date.now(),
        generation: Date.now(),
        carts: {
          [store.id]: {
            storeId: store.id,
            storeSlug: store.slug,
            storeName: store.name,
            touchedAtMs: Date.now(),
            lines: [
              {
                lineId: `final-ship-${product.id}`,
                productId: product.id,
                title: product.title,
                thumbnailUrl: null,
                qty: 1,
                unitPricePhp: product.unitPhp,
                listUnitPricePhp: product.unitPhp,
                discountPercent: null,
                modifierWire: null,
                optionSelections: {},
                optionsSummary: "",
                lineNote: null,
                pickupAvailable: true,
                localDeliveryAvailable: true,
                shippingAvailable: false,
                minOrderQty: 1,
                maxOrderQty: 99,
              },
            ],
          },
        },
      };
      localStorage.setItem("kasama_store_commerce_cart_v1", JSON.stringify(snap));
    },
    { store: STORE, product: PRODUCT }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const deploy = deployInfo();
  const headLocal = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const originMain = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
  const sb = sbService();

  const report = {
    measuredAt: new Date().toISOString(),
    HEAD_LOCAL: headLocal,
    ORIGIN_MAIN: originMain,
    PRODUCTION_ALIAS: ORIGIN,
    DEPLOYMENT: deploy,
    CODE_CHANGE: "NONE",
    matrix: {},
    shots: {},
    notProven: [],
    fails: [],
    giftSafety: null,
    giftSend: null,
    forensic: {
      ERROR: "NONE_PROVEN",
      OMISSION: "NONE_PROVEN",
      LEAK: "NONE_PROVEN",
      DUPLICATION: "DEAD_GiftArtwork_file_no_live_import",
      BOTTLENECK: "NONE_PROVEN",
    },
  };

  // --- CART_APPLY_390 ---
  {
    const session = await loginSession(SENDER.email);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    await context.addCookies(cookieList(session));
    const page = await context.newPage();
    await seedCart(page);

    for (let i = 0; i < 20; i++) {
      if ((await page.locator('[data-cart-gift-pick="1"], [data-cart-gift-applied="1"]').count()) > 0) break;
      await page.waitForTimeout(400);
    }
    const pick = page.locator('[data-cart-gift-pick="1"]').first();
    if ((await pick.count()) > 0) {
      await pick.click().catch(() => {});
      await page.waitForTimeout(900);
    }
    report.shots.CART_APPLY_390 = await shot(page, "CART-APPLY-390");
    const html = await page.content();
    const text = await page.locator("body").innerText();
    const c = analyze(html, text);
    const panel = html.includes('data-store-cart-gift-panel="1"');
    const picker = html.includes('data-cart-gift-picker="1"');
    const emptyCart = /cart is empty|장바구니가 비어/i.test(text);
    const emptyGift = html.includes('data-cart-gift-state="empty"');
    let RESULT = "NOT_PROVEN";
    let blocker = null;
    if (panel && picker && c.MODERN_FACE === "PASS") RESULT = rollup(c);
    else if (panel && picker) RESULT = "FAIL";
    else if (emptyCart) blocker = "empty cart after localStorage seed";
    else if (emptyGift) blocker = "cart lines present but no eligible ACTIVE gift";
    else if (!panel) blocker = "store cart gift panel not rendered";
    else blocker = "picker / modern face not rendered";
    report.matrix.CART_APPLY_390 = { RESULT, ...c, panel, picker, emptyCart, emptyGift, blocker };
    if (RESULT === "NOT_PROVEN") report.notProven.push("CART_APPLY_390");
    if (RESULT === "FAIL") report.fails.push("CART_APPLY_390");
    await browser.close();
  }

  // --- SAFETY + ONE QA GIFT SEND → CHAT SM + RECEIVED ---
  const safety = await proveSafeQaGift(sb);
  report.giftSafety = safety;
  if (!safety.ok) {
    report.matrix.MESSENGER_CHAT_SM = {
      RESULT: "NOT_PROVEN",
      blocker: safety.blocker,
    };
    report.matrix.RECEIVED_390 = {
      RESULT: "NOT_PROVEN",
      blocker: safety.blocker,
    };
    report.notProven.push("MESSENGER_CHAT_SM", "RECEIVED_390");
  } else {
    const session = await loginSession(SENDER.email);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    await context.addCookies(cookieList(session));
    const page = await context.newPage();

    await page.goto(
      `${ORIGIN}/community-messenger/rooms/${encodeURIComponent(ROOM_ID)}?openGift=1`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await page.waitForTimeout(1500);
    try {
      await page.waitForSelector('[data-gift-offer-select-list="1"], [data-gift-offer-empty="1"]', {
        timeout: 20000,
      });
    } catch {
      /* */
    }

    // Prefer exact safe instance if listed; else first offerable card
    const option = page.locator(`[data-gift-offer-option="${safety.gift.id}"]`).first();
    const anyOption = page.locator("[data-gift-offer-option], [data-gift-visual-card=\"1\"]").first();
    if ((await option.count()) > 0) {
      await option.click({ force: true }).catch(() => {});
    } else if ((await anyOption.count()) > 0) {
      await anyOption.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(600);
    const submit = page.locator('[data-gift-offer-submit="1"]').first();
    let offerOk = false;
    let offerBody = null;
    if ((await submit.count()) > 0) {
      const [resp] = await Promise.all([
        page
          .waitForResponse(
            (r) => r.url().includes("/api/me/gift-certificates/transfers/offer") && r.request().method() === "POST",
            { timeout: 30000 }
          )
          .catch(() => null),
        submit.click({ force: true }),
      ]);
      if (resp) {
        offerBody = await resp.json().catch(() => null);
        offerOk = Boolean(resp.ok() && offerBody?.ok);
      }
    } else {
      // API fallback using same session cookies (still Production offer authority)
      const idempotencyKey = randomUUID();
      offerBody = await page.evaluate(
        async ({ instanceId, recipientUserId, roomId, idempotencyKey }) => {
          const res = await fetch("/api/me/gift-certificates/transfers/offer", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instanceId, recipientUserId, roomId, idempotencyKey }),
          });
          return res.json();
        },
        {
          instanceId: safety.gift.id,
          recipientUserId: RECIPIENT.userId,
          roomId: ROOM_ID,
          idempotencyKey,
        }
      );
      offerOk = Boolean(offerBody?.ok);
      await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(ROOM_ID)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
    }

    report.giftSend = {
      ok: offerOk,
      instanceId: safety.gift.id,
      publicGiftNumber: safety.gift.publicGiftNumber,
      recipient: RECIPIENT.email,
      roomId: ROOM_ID,
      responseKeys: offerBody ? Object.keys(offerBody) : null,
      transferId: offerBody?.transfer?.id || offerBody?.transferId || null,
      messageId: offerBody?.message?.id || offerBody?.messageId || null,
      error: offerBody?.error || null,
    };

    // Close offer sheet if still open, then prove chat timeline card (not confirm Face).
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
    await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(ROOM_ID)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 10; i++) {
      const chatCard = await page
        .locator('[data-messenger-gift-certificate-card="1"] [data-gift-face-size="sm"]')
        .count();
      if (chatCard > 0) break;
      await page.mouse.wheel(0, -1200).catch(() => {});
      await page.waitForTimeout(350);
    }
    report.shots.MESSENGER_CHAT_SM = await shot(page, "MESSENGER-CHAT-SM");
    {
      const html = await page.content();
      const text = await page.locator("body").innerText();
      const c = analyze(html, text);
      const chatCard = html.includes('data-messenger-gift-certificate-card="1"');
      const offerSheetOpen =
        html.includes('data-gift-offer-confirm="1"') || html.includes('data-gift-offer-select-list="1"');
      const found = chatCard && c.FACE_SM === "PASS" && c.visualCard && !offerSheetOpen;
      let RESULT = "NOT_PROVEN";
      let blocker = null;
      if (found && c.MODERN_FACE === "PASS") RESULT = rollup(c);
      else if (found) RESULT = "FAIL";
      else if (!offerOk) blocker = `gift_send_failed:${report.giftSend.error || "unknown"}`;
      else if (offerSheetOpen) blocker = "offer sheet still open — not chat timeline size=sm";
      else blocker = "messenger gift certificate card size=sm not visible after send";
      report.matrix.MESSENGER_CHAT_SM = {
        RESULT,
        ...c,
        found,
        chatCard,
        offerSheetOpen,
        roomId: ROOM_ID,
        offerOk,
        blocker,
      };
      if (RESULT === "NOT_PROVEN") report.notProven.push("MESSENGER_CHAT_SM");
      if (RESULT === "FAIL") report.fails.push("MESSENGER_CHAT_SM");
    }
    await browser.close();

    // RECEIVED as recipient
    {
      const recvSession = await loginSession(RECIPIENT.email);
      const browser2 = await chromium.launch({ headless: true });
      const context2 = await browser2.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      await context2.addCookies(cookieList(recvSession));
      const page2 = await context2.newPage();
      await page2.goto(`${ORIGIN}/orders/activity?tab=gifts&giftTab=received`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      try {
        await page2.waitForSelector('[data-customer-gift-wallet="1"]', { timeout: 25000 });
      } catch {
        /* */
      }
      await page2.waitForTimeout(1200);
      report.shots.RECEIVED_390 = await shot(page2, "RECEIVED-390");
      const html = await page2.content();
      const text = await page2.locator("body").innerText();
      const cards = await page2.locator('[data-gift-visual-card="1"]').count();
      const c = analyze(html, text);
      let RESULT = "NOT_PROVEN";
      let blocker = null;
      if (cards > 0 && c.MODERN_FACE === "PASS") RESULT = rollup(c);
      else if (cards > 0) RESULT = "FAIL";
      else blocker = "received pendingTransfers empty after QA gift send";
      report.matrix.RECEIVED_390 = { RESULT, ...c, cardCount: cards, blocker };
      if (RESULT === "NOT_PROVEN") report.notProven.push("RECEIVED_390");
      if (RESULT === "FAIL") report.fails.push("RECEIVED_390");
      await browser2.close();
    }
  }

  report.firstDivergence = report.fails[0] || null;
  const required = ["CART_APPLY_390", "RECEIVED_390", "MESSENGER_CHAT_SM"];
  const requiredPass = required.every((k) => report.matrix[k]?.RESULT === "PASS");
  report.FULL_HARD_LOCK =
    report.fails.length === 0 && requiredPass && report.notProven.length === 0 ? "YES" : "HOLD";

  const outPath = resolve(OUT, "FINAL_SHIP_AUDIT_RUNTIME.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        deploy,
        HEAD: headLocal.slice(0, 9),
        ORIGIN: originMain.slice(0, 9),
        matrix: Object.fromEntries(required.map((k) => [k, report.matrix[k]?.RESULT])),
        blockers: Object.fromEntries(
          required.map((k) => [k, report.matrix[k]?.blocker || null]).filter(([, b]) => b)
        ),
        giftSafety: report.giftSafety,
        giftSend: report.giftSend,
        firstDivergence: report.firstDivergence,
        FULL_HARD_LOCK: report.FULL_HARD_LOCK,
        notProven: report.notProven,
        fails: report.fails,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
