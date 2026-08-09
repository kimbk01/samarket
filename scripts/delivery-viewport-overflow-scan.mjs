#!/usr/bin/env node
/**
 * Delivery viewport overflow scanner — Runtime DOM proof.
 *
 * Usage:
 *   node scripts/delivery-viewport-overflow-scan.mjs [--base URL] [--widths 320,360,390,430] [--out PATH]
 *
 * Env:
 *   DELIVERY_VIEWPORT_BASE (default https://samarket.vercel.app)
 *   DELIVERY_VIEWPORT_SLUG  (optional store slug for locked routes)
 *   DELIVERY_VIEWPORT_OUT   (default .qa-logs/delivery-viewport-hardening/runtime-scan.json)
 *
 * Classification:
 *   - document scrollWidth > clientWidth → page overflow FAIL candidate
 *   - elements with rect outside viewport, excluding those inside overflow-x:auto/scroll ancestors
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE =
  process.env.DELIVERY_VIEWPORT_BASE ||
  process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length) ||
  "https://samarket.vercel.app";

const widthsArg =
  process.argv.find((a) => a.startsWith("--widths="))?.slice("--widths=".length) ||
  process.env.DELIVERY_VIEWPORT_WIDTHS ||
  "320,360,390,430";
const WIDTHS = widthsArg.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);

const OUT =
  process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ||
  process.env.DELIVERY_VIEWPORT_OUT ||
  ".qa-logs/delivery-viewport-hardening/runtime-scan.json";

const SLUG = process.env.DELIVERY_VIEWPORT_SLUG || "";

/** Public / semi-public routes. Auth-gated → BLOCKED when redirected to login. */
function buildRoutes(slug) {
  const s = slug || "__SLUG__";
  return [
    { id: "stores", path: "/stores", needsSlug: false },
    { id: "stores-browse-food", path: "/stores/browse/food", needsSlug: false },
    { id: "stores-search", path: "/stores/search", needsSlug: false },
    { id: "stores-cart-hub", path: "/stores/cart", needsSlug: false },
    { id: "orders", path: "/orders", needsSlug: false },
    { id: "address-select", path: "/address/select", needsSlug: false },
    { id: "mypage-addresses", path: "/mypage/addresses", needsSlug: false },
    { id: "mypage-addresses-edit", path: "/mypage/addresses/edit", needsSlug: false },
    { id: "owner-apply", path: "/stores/owner/apply", needsSlug: false },
    { id: "owner-hub", path: "/stores/owner", needsSlug: false },
    { id: "store-slug", path: `/stores/${s}`, needsSlug: true },
    { id: "store-cart", path: `/stores/${s}/cart`, needsSlug: true },
    { id: "store-checkout", path: `/stores/${s}/checkout`, needsSlug: true },
    { id: "store-info", path: `/stores/${s}/info`, needsSlug: true },
    { id: "store-reviews", path: `/stores/${s}/reviews`, needsSlug: true },
    { id: "store-report", path: `/stores/${s}/report`, needsSlug: true },
  ];
}

async function discoverSlug(page, base) {
  if (SLUG) return SLUG;
  await page.goto(`${base}/stores`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  const href = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/stores/"]');
    return a?.getAttribute("href") || "";
  });
  const m = href.match(/^\/stores\/([^/?#]+)/);
  if (!m) return "";
  const seg = decodeURIComponent(m[1]);
  if (["browse", "search", "cart", "owner"].includes(seg)) return "";
  return seg;
}

async function measurePage(page, viewportWidth) {
  return page.evaluate(({ vw, tolerance }) => {
    const docEl = document.documentElement;
    const body = document.body;
    const viewportW = window.innerWidth || vw;
    const viewportH = window.innerHeight;

    function isClippedOrIntentionalHorizontalChild(el) {
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        const ox = cs.overflowX;
        // intentional rails OR clipped chip rows (overflow-x hidden/clip) — not document overflow
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
        p = p.parentElement;
      }
      return false;
    }

    function cssPath(el) {
      const parts = [];
      let cur = el;
      for (let i = 0; cur && cur.nodeType === 1 && i < 6; i++) {
        let part = cur.tagName.toLowerCase();
        if (cur.id) {
          part += `#${cur.id}`;
          parts.unshift(part);
          break;
        }
        const cls = (cur.className && typeof cur.className === "string"
          ? cur.className
          : ""
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".");
        if (cls) part += `.${cls}`;
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }

    const offenders = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (!(el instanceof HTMLElement)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const leftOut = r.left < -tolerance;
      const rightOut = r.right > viewportW + tolerance;
      if (!leftOut && !rightOut) continue;
      if (isClippedOrIntentionalHorizontalChild(el)) continue;
      const parent = el.parentElement;
      const pcs = parent ? getComputedStyle(parent) : null;
      offenders.push({
        path: cssPath(el),
        className: typeof el.className === "string" ? el.className.slice(0, 240) : "",
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        position: cs.position,
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
        parentOverflowX: pcs?.overflowX || null,
        parentWidth: parent ? Math.round(parent.getBoundingClientRect().width * 10) / 10 : null,
      });
      if (offenders.length >= 12) break;
    }

    const safeTop =
      getComputedStyle(docEl).getPropertyValue("--safe-top").trim() ||
      getComputedStyle(docEl).getPropertyValue("--dibay-safe-top").trim() ||
      "";
    const headers = [...document.querySelectorAll("header, [class*='sector-header'], [class*='sticky']")].slice(
      0,
      8
    );
    const headerRects = headers.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        path: cssPath(el),
        top: Math.round(r.top * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        className: typeof el.className === "string" ? el.className.slice(0, 160) : "",
      };
    });

    return {
      viewport: { width: viewportW, height: viewportH },
      document: {
        clientWidth: docEl.clientWidth,
        scrollWidth: docEl.scrollWidth,
        bodyClientWidth: body?.clientWidth ?? null,
        bodyScrollWidth: body?.scrollWidth ?? null,
      },
      pageOverflow: docEl.scrollWidth > docEl.clientWidth + 1,
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      safeTopCssVar: safeTop,
      headerRects,
      offenders,
    };
  }, { vw: viewportWidth, tolerance: 1 });
}

function classifyNav(finalUrl, routePath) {
  const u = finalUrl || "";
  if (/\/login|\/auth|sign-in|kakao/i.test(u) && !u.includes(routePath.split("?")[0])) {
    return "BLOCKED_AUTH";
  }
  return "OK";
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  let slug = SLUG;
  try {
    slug = await discoverSlug(page, BASE.replace(/\/$/, ""));
  } catch (e) {
    console.error("slug discover failed", e?.message || e);
  }

  const routes = buildRoutes(slug).filter((r) => !r.needsSlug || Boolean(slug));
  const skippedSlugRoutes = buildRoutes(slug).filter((r) => r.needsSlug && !slug);

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE.replace(/\/$/, ""),
    slug: slug || null,
    widths: WIDTHS,
    results: [],
    skipped: skippedSlugRoutes.map((r) => ({ id: r.id, path: r.path, reason: "NO_SLUG" })),
  };

  for (const route of routes) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 844 });
      const url = `${report.base}${route.path}`;
      let status = "OK";
      let measure = null;
      let error = null;
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(900);
        const finalUrl = page.url();
        status = classifyNav(finalUrl, route.path);
        if (resp && resp.status() >= 400) status = `HTTP_${resp.status()}`;
        if (status === "OK") {
          measure = await measurePage(page, w);
          // Document overflow is authoritative. Rect offenders alone = WARN (clipped rails etc.)
          if (measure.pageOverflow || measure.bodyOverflow) {
            status = "OVERFLOW";
          } else if (measure.offenders.length) {
            status = "WARN_CLIPPED_OFFSCREEN";
          } else {
            status = "PASS";
          }
        }
      } catch (e) {
        status = "ERROR";
        error = String(e?.message || e);
      }
      const row = {
        id: route.id,
        path: route.path,
        width: w,
        status,
        url: page.url(),
        error,
        measure,
      };
      report.results.push(row);
      const cw = measure?.document?.clientWidth;
      const sw = measure?.document?.scrollWidth;
      console.log(
        `${route.id.padEnd(22)} w=${String(w).padStart(3)} ${status}` +
          (cw != null ? `  client=${cw} scroll=${sw}` : "") +
          (measure?.offenders?.[0] ? `  offender=${measure.offenders[0].path}` : "")
      );
    }
  }

  const outPath = path.isAbsolute(OUT) ? OUT : path.join(process.cwd(), OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`slug=${slug || "(none)"} base=${report.base}`);

  await browser.close();

  const overflowCount = report.results.filter((r) => r.status === "OVERFLOW").length;
  const passCount = report.results.filter((r) => r.status === "PASS").length;
  const blockedCount = report.results.filter((r) => String(r.status).startsWith("BLOCKED")).length;
  console.log(`PASS=${passCount} OVERFLOW=${overflowCount} BLOCKED=${blockedCount}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
