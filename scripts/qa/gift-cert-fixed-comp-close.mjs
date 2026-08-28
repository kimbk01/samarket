#!/usr/bin/env node
/**
 * Fixed-comp gift certificate runtime close — authenticated mall detail + wallet owned.
 * Usage: node scripts/qa/gift-cert-fixed-comp-close.mjs [baseUrl]
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3042").replace(/\/$/, "");
const PRODUCT_ID = "50a03efa-f52e-4a70-960d-7d2cd7063830";
const NAV_TIMEOUT_MS = 45000;
const SELECTOR_TIMEOUT_MS = 30000;

function loadEnvLocal() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function ensureAuth(context, page) {
  const origin = new URL(BASE);
  const storage = process.env.PLAYWRIGHT_STORAGE_STATE ?? resolve("tests/e2e/.auth/cm-storage.json");
  if (existsSync(storage)) {
    const raw = JSON.parse(readFileSync(storage, "utf8"));
    if (raw.cookies?.length) {
      const cookies = raw.cookies.map((c) => ({
        ...c,
        domain: origin.hostname,
        secure: origin.protocol === "https:",
      }));
      await context.addCookies(cookies);
      const probe = await page.request.get(`${BASE}/api/me/settings`).catch(() => null);
      if (probe?.ok()) return "storageState";
    }
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return "BLOCKED_BY_AUTH";

  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return "BLOCKED_BY_AUTH";

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const candidates = [
    { email: "aaaa@manual.local", pass: "1234" },
    { email: "aaaa@samarket.local", pass: "1234" },
  ];

  for (const c of candidates) {
    const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.pass });
    if (error || !data.session) continue;
    const session = data.session;
    const cookieValue = encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    );
    await context.addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: cookieValue,
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
    const probe = await page.request.get(`${BASE}/api/me/settings`).catch(() => null);
    if (probe?.ok()) return "supabaseCookie";
  }

  return "BLOCKED_BY_AUTH";
}

async function measure(page, label, url, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  if (page.url().includes("/login")) {
    return { tag: label, error: "redirected to login", walletAuth: "BLOCKED_BY_AUTH" };
  }
  await page.waitForSelector("[data-gift-cert-face]", { timeout: SELECTOR_TIMEOUT_MS });

  return page.evaluate((tag) => {
    const face = document.querySelector("[data-gift-cert-face]");
    if (!face) return { tag, error: "no face" };

    const faceRect = face.getBoundingClientRect();
    const pick = (sel) => {
      const el = face.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };

    const amount =
      face.querySelector("[data-gift-face-amount]") ??
      face.querySelector("[data-gift-remaining-amount]");
    const amountRect = amount ? amount.getBoundingClientRect() : null;
    const amountText = amount?.textContent?.trim() ?? "";
    const valuePanel = face.querySelector("[data-gift-cert-value-panel]");
    const valueContent = face.querySelector("[data-gift-cert-value-content]");
    const valuePanelRect = valuePanel?.getBoundingClientRect() ?? null;
    const valueContentRect = valueContent?.getBoundingClientRect() ?? null;
    const footer = face.querySelector("[data-gift-cert-footer]");
    const footerTop = footer?.getBoundingClientRect().top ?? faceRect.bottom;

    const safePad = 2;
    let amountClipping = 0;
    if (amountRect && valueContentRect) {
      if (amountRect.right > valueContentRect.right - safePad) amountClipping++;
      if (amountRect.left < valueContentRect.left + safePad) amountClipping++;
    }
    if (amountRect && valuePanelRect) {
      if (amountRect.right > valuePanelRect.right - safePad) amountClipping++;
      if (amountRect.left < valuePanelRect.left + safePad) amountClipping++;
    }
    if (amountRect && faceRect) {
      if (amountRect.right > faceRect.right - safePad) amountClipping++;
    }
    if (amountRect && amountRect.bottom > footerTop - safePad) amountClipping++;

    const ellipsis =
      amount && getComputedStyle(amount).textOverflow === "ellipsis" && amount.scrollWidth > amount.clientWidth
        ? 1
        : 0;

    const overflow =
      face.scrollWidth > face.clientWidth + 1 || face.scrollHeight > face.clientHeight + 1 ? 1 : 0;

    return {
      tag,
      card: { w: faceRect.width, h: faceRect.height },
      layers: {
        badge: Boolean(face.querySelector("[data-gift-cert-top-badge]")),
        scurve: Boolean(face.querySelector("[data-gift-cert-s-curve]")),
        valuePanel: Boolean(valuePanel),
        footer: Boolean(footer),
        goldDivider: Boolean(face.querySelector("[data-gift-gold-divider]")),
        logo: Boolean(face.querySelector("[data-gift-dibay-logo]")),
        artwork: Boolean(face.querySelector("[data-gift-cert-artwork]")),
      },
      rects: {
        logo: pick("[data-gift-dibay-logo]"),
        brand: pick("[data-gift-cert-brand]"),
        valueContent: valueContentRect
          ? {
              x: valueContentRect.x,
              y: valueContentRect.y,
              w: valueContentRect.width,
              h: valueContentRect.height,
              right: valueContentRect.right,
            }
          : null,
        amount: amountRect
          ? {
              x: amountRect.x,
              y: amountRect.y,
              w: amountRect.width,
              h: amountRect.height,
              right: amountRect.right,
              text: amountText,
            }
          : null,
        valuePanel: valuePanelRect
          ? { x: valuePanelRect.x, w: valuePanelRect.width, right: valuePanelRect.right }
          : null,
        badge: pick("[data-gift-cert-top-badge]"),
        footer: pick("[data-gift-cert-footer]"),
      },
      amountClipping,
      ellipsis,
      overflow,
      aspect: faceRect.width / faceRect.height,
    };
  }, label);
}

function assertCase(r) {
  if (r.error) return { ok: false, reason: r.error };
  const l = r.layers;
  if (!l.badge || !l.scurve || !l.valuePanel || !l.footer || !l.logo || !l.artwork) {
    return { ok: false, reason: "missing layer" };
  }
  if (r.amountClipping > 0) return { ok: false, reason: "amount clipping" };
  if (r.ellipsis > 0) return { ok: false, reason: "ellipsis" };
  if (r.overflow > 0) return { ok: false, reason: "overflow" };
  if (r.aspect <= 1.64 || r.aspect >= 1.68) return { ok: false, reason: "aspect" };
  if (r.rects.amount?.text && r.rects.amount.text.includes("…")) {
    return { ok: false, reason: "truncated amount text" };
  }
  return { ok: true };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const authMethod = await ensureAuth(context, page);
  if (authMethod === "BLOCKED_BY_AUTH") {
    await browser.close();
    console.log(
      JSON.stringify(
        {
          pass: false,
          walletAuth: "BLOCKED_BY_AUTH",
          mallOk: false,
          walletOk: "NOT_PROVEN",
          authMethod,
          results: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const results = [];
  for (const c of [
    {
      label: "mall-detail-desktop",
      url: `${BASE}/stores/gift-mall/${PRODUCT_ID}`,
      viewport: { width: 1280, height: 900 },
    },
    {
      label: "wallet-owned-desktop",
      url: `${BASE}/orders/activity?tab=gifts&giftTab=owned`,
      viewport: { width: 1280, height: 900 },
    },
  ]) {
    try {
      results.push(await measure(page, c.label, c.url, c.viewport));
    } catch (e) {
      results.push({ tag: c.label, error: String(e) });
    }
  }

  await browser.close();

  const mall = results.find((r) => r.tag === "mall-detail-desktop");
  const wallet = results.find((r) => r.tag === "wallet-owned-desktop");
  const mallOk = mall ? assertCase(mall).ok : false;
  const walletOk = wallet ? assertCase(wallet).ok : false;
  const pass = mallOk && walletOk;

  console.log(
    JSON.stringify(
      {
        pass,
        walletAuth: authMethod,
        mallOk,
        walletOk,
        authMethod,
        results,
      },
      null,
      2
    )
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
