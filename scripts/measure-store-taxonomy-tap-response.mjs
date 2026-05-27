#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = (process.env.BASE_URL || "http://192.168.100.7:3000").replace(/\/$/, "");
const RUNS = Number(process.env.RUNS || "3");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

function percentile(values, p) {
  const xs = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1));
  return xs[idx];
}

async function waitForClassAfter(page, selector, className, start) {
  await page.waitForFunction(
    ({ selector: sel, className: cls }) => {
      const el = document.querySelector(sel);
      return !!el && el.classList.contains(cls);
    },
    { selector, className },
    { timeout: 5000 },
  );
  return await page.evaluate((s) => performance.now() - s, start);
}

async function measurePointerdownClassInPage(page, selector, className) {
  return page.evaluate(
    async ({ selector: sel, className: cls }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing selector ${sel}`);
      const t0 = performance.now();
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: 1,
          isPrimary: true,
        }),
      );
      if (el.classList.contains(cls)) return performance.now() - t0;
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          obs.disconnect();
          reject(new Error(`timeout waiting ${cls}`));
        }, 5000);
        const obs = new MutationObserver(() => {
          if (!el.classList.contains(cls)) return;
          window.clearTimeout(timeout);
          obs.disconnect();
          resolve(undefined);
        });
        obs.observe(el, { attributes: true, attributeFilter: ["class"] });
      });
      return performance.now() - t0;
    },
    { selector, className },
  );
}

async function measureClickClassInPage(page, selector, className) {
  return page.evaluate(
    async ({ selector: sel, className: cls }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing selector ${sel}`);
      const t0 = performance.now();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (el.classList.contains(cls)) return performance.now() - t0;
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          obs.disconnect();
          reject(new Error(`timeout waiting ${cls}`));
        }, 5000);
        const obs = new MutationObserver(() => {
          if (!el.classList.contains(cls)) return;
          window.clearTimeout(timeout);
          obs.disconnect();
          resolve(undefined);
        });
        obs.observe(el, { attributes: true, attributeFilter: ["class"] });
      });
      return performance.now() - t0;
    },
    { selector, className },
  );
}

async function measureClickTitleInPage(page, selector, title) {
  return page.evaluate(
    async ({ selector: sel, title: expectedTitle }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing selector ${sel}`);
      const h1 = document.querySelector("h1");
      const t0 = performance.now();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (h1?.textContent?.trim() === expectedTitle) return performance.now() - t0;
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          obs.disconnect();
          reject(new Error(`timeout waiting title ${expectedTitle}`));
        }, 5000);
        const obs = new MutationObserver(() => {
          if (document.querySelector("h1")?.textContent?.trim() !== expectedTitle) return;
          window.clearTimeout(timeout);
          obs.disconnect();
          resolve(undefined);
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      return performance.now() - t0;
    },
    { selector, title },
  );
}

async function measurePrimaryClickInPage(page, selector, title) {
  return page.evaluate(
    async ({ selector: sel, title: expectedTitle }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing selector ${sel}`);
      const t0 = performance.now();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      const activeNow = el.classList.contains("stores-browse-header-primary-tab--active")
        ? performance.now() - t0
        : null;
      const titleNow = document.querySelector("h1")?.textContent?.trim() === expectedTitle
        ? performance.now() - t0
        : null;
      const pending = [];
      if (activeNow == null) {
        pending.push(
          new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              obs.disconnect();
              reject(new Error("timeout waiting active"));
            }, 5000);
            const obs = new MutationObserver(() => {
              if (!el.classList.contains("stores-browse-header-primary-tab--active")) return;
              window.clearTimeout(timeout);
              obs.disconnect();
              resolve(["active", performance.now() - t0]);
            });
            obs.observe(el, { attributes: true, attributeFilter: ["class"] });
          }),
        );
      }
      if (titleNow == null) {
        pending.push(
          new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              obs.disconnect();
              reject(new Error(`timeout waiting title ${expectedTitle}`));
            }, 5000);
            const obs = new MutationObserver(() => {
              if (document.querySelector("h1")?.textContent?.trim() !== expectedTitle) return;
              window.clearTimeout(timeout);
              obs.disconnect();
              resolve(["title", performance.now() - t0]);
            });
            obs.observe(document.body, { childList: true, subtree: true, characterData: true });
          }),
        );
      }
      const result = {
        active: activeNow,
        title: titleNow,
      };
      for (const entry of await Promise.all(pending)) {
        result[entry[0]] = entry[1];
      }
      return result;
    },
    { selector, title },
  );
}

async function pointerDown(locator) {
  await locator.evaluate((el) => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
      }),
    );
  });
}

async function pointerUp(locator) {
  await locator.evaluate((el) => {
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
      }),
    );
  });
}

async function domClick(locator) {
  await locator.evaluate((el) => {
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  });
}

async function gotoAppPage(page, url) {
  await page.goto(url, { waitUntil: "commit", timeout: 120_000 });
  if (!page.url().includes("/auth/consent")) return;
  await page.locator('input[type="checkbox"]').nth(0).check({ timeout: 10_000 });
  await page.locator('input[type="checkbox"]').nth(1).check({ timeout: 10_000 });
  await page.locator("button").last().click({ timeout: 10_000 });
  await page.waitForURL((nextUrl) => !nextUrl.pathname.startsWith("/auth/consent"), { timeout: 60_000 });
  if (page.url() !== url) {
    await page.goto(url, { waitUntil: "commit", timeout: 120_000 });
  }
}

async function runOnce(run) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const ref = url?.match(/https:\/\/([^.]+)\./)?.[1] ?? null;
  let authCookie = null;
  if (url && anon && ref) {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const password = process.env.E2E_TEST_PASSWORD ?? "1234";
    const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
    for (const loginId of loginIds) {
      const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.session) continue;
      const session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      };
      authCookie = {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: new URL(BASE_URL).hostname,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      };
      break;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  if (authCookie) await context.addCookies([authCookie]);
  const page = await context.newPage();

  const out = { run };

  if (process.env.SKIP_HOME !== "1") try {
    await gotoAppPage(page, `${BASE_URL}/stores`);
    await page.waitForSelector(".stores-home-sub-category-link", { state: "visible", timeout: 15_000 });
    const homeChinese = page.locator('a.stores-home-sub-category-link[href*="/stores/browse/restaurant"][href*="sub=chinese"]').first();
    const homeSelector = 'a.stores-home-sub-category-link[href*="/stores/browse/restaurant"][href*="sub=chinese"]';
    out.home_sub_pointerdown_to_pressed_ms = await measurePointerdownClassInPage(
      page,
      homeSelector,
      "stores-home-sub-category-link--pressed",
    );
    await pointerUp(homeChinese).catch(() => {});
  } catch (e) {
    out.home_sub_pointerdown_to_pressed_ms = null;
    out.home_probe_skipped = String(e?.message ?? e).slice(0, 180);
    out.home_probe_url = page.url();
  } else {
    out.home_sub_pointerdown_to_pressed_ms = null;
    out.home_probe_skipped = "SKIP_HOME=1";
  }

  await gotoAppPage(page, `${BASE_URL}/stores/browse/restaurant?sub=chinese`);
  await page.waitForSelector(".stores-browse-sub-chip-link", { state: "visible", timeout: 60_000 });

  const targetSubMeta = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a.stores-browse-sub-chip-link"));
    const hit = links.find((a) => !a.classList.contains("stores-browse-sub-chip-link--active")) ?? links[0];
    if (!hit) return null;
    const href = hit.getAttribute("href") || "";
    return {
      href,
      selector: `a.stores-browse-sub-chip-link[href="${href.replace(/"/g, '\\"')}"]`,
      label: hit.textContent?.trim() || href,
    };
  });
  if (!targetSubMeta) throw new Error("no visible browse sub chip");
  const targetSub = page.locator(targetSubMeta.selector).first();
  const targetSubSelector = targetSubMeta.selector;
  out.browse_sub_target_label = targetSubMeta.label;
  out.browse_sub_pointerdown_to_pressed_ms = await measurePointerdownClassInPage(
    page,
    targetSubSelector,
    "stores-browse-sub-chip-link--pressed",
  );
  await pointerUp(targetSub).catch(() => {});

  out.browse_sub_click_to_active_ms = await measureClickClassInPage(
    page,
    targetSubSelector,
    "stores-browse-sub-chip-link--active",
  );
  await page.waitForURL((url) => url.href.includes(targetSubMeta.href), { timeout: 10_000 }).catch((e) => {
    out.browse_sub_navigation_note = String(e?.message ?? e).split("\n")[0];
    out.browse_sub_navigation_url = page.url();
  });

  await gotoAppPage(page, `${BASE_URL}/stores/browse/restaurant?sub=chinese`);
  await page.waitForSelector(".stores-browse-header-primary-tab", { state: "visible", timeout: 60_000 });
  const primaryMeta = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a.stores-browse-header-primary-tab"));
    const hit = links.find((a) => {
      const href = a.getAttribute("href") || "";
      return href.includes("/stores/browse/") && !href.includes("/stores/browse/restaurant");
    });
    if (!hit) return null;
    const href = hit.getAttribute("href") || "";
    return {
      href,
      selector: `a.stores-browse-header-primary-tab[href="${href.replace(/"/g, '\\"')}"]`,
      label: hit.textContent?.trim() || href,
    };
  });
  if (!primaryMeta) {
    out.browse_primary_click_to_active_ms = null;
    out.browse_primary_click_to_title_ms = null;
  } else {
    out.browse_primary_target_label = primaryMeta.label;
    const primaryTiming = await measurePrimaryClickInPage(page, primaryMeta.selector, primaryMeta.label);
    out.browse_primary_click_to_active_ms = primaryTiming.active;
    out.browse_primary_click_to_title_ms = primaryTiming.title;
  }

  await browser.close();
  return out;
}

const results = [];
for (let i = 1; i <= RUNS; i += 1) {
  const result = await runOnce(i);
  results.push(result);
  console.log(`[store-taxonomy-tap-response] ${JSON.stringify(result)}`);
}

const keys = [
  "home_sub_pointerdown_to_pressed_ms",
  "browse_sub_pointerdown_to_pressed_ms",
  "browse_sub_click_to_active_ms",
  "browse_primary_click_to_active_ms",
  "browse_primary_click_to_title_ms",
];

const summary = Object.fromEntries(
  keys.map((key) => {
    const values = results.map((r) => r[key]).filter((v) => typeof v === "number");
    return [
      key,
      {
        min: values.length ? Math.min(...values) : null,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        max: values.length ? Math.max(...values) : null,
      },
    ];
  }),
);

console.log(`[store-taxonomy-tap-response:summary] ${JSON.stringify(summary)}`);
