#!/usr/bin/env node
/**
 * CUT-SSOT-5 — Production API runtime matrix (CASE A–H).
 * Read-only. Writes `.qa-logs/marketplace-list-ssot-runtime/REPORT.json`.
 *
 * Usage:
 *   node scripts/qa/marketplace-list-ssot-runtime-matrix.mjs
 *   MARKETPLACE_SSOT_ORIGIN=https://samarket.vercel.app node scripts/qa/...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const ORIGIN = (process.env.MARKETPLACE_SSOT_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = path.join(root, ".qa-logs/marketplace-list-ssot-runtime");
const PASIG = "1381200000";
const EXCHANGE_ROOT = "fa4af727-ec64-466e-b164-42368b839daf";
const USED_CAR_ROOT = "50feae02-9fb9-4b59-8ab7-7e43a0f5c407";

/** Known exchange membership ids (prod census 2026-08-20 audit). */
const EXCHANGE_IDS = new Set([
  EXCHANGE_ROOT,
  "fa4af727-ec64-466e-b164-42368b839daf",
]);

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, body, url };
}

function postsOf(body) {
  const posts = body?.posts ?? body?.data?.posts ?? [];
  return Array.isArray(posts) ? posts : [];
}

function categoryIds(posts) {
  return posts.map((p) => String(p.trade_category_id || p.category_id || "").trim()).filter(Boolean);
}

function allInSet(ids, allowed) {
  if (ids.length === 0) return { pass: true, reason: "empty_page" };
  const bad = ids.filter((id) => !allowed.has(id));
  return bad.length === 0
    ? { pass: true, reason: "all_in_membership" }
    : { pass: false, reason: `outside_membership:${bad.slice(0, 3).join(",")}` };
}

function firstTitle(posts) {
  return posts[0]?.title ? String(posts[0].title).slice(0, 80) : null;
}

async function resolveExchangeMembership(origin) {
  const boot = await fetchJson(
    `${origin}/api/categories/market-bootstrap?q=${encodeURIComponent(EXCHANGE_ROOT)}`
  );
  const children = boot.body?.children ?? boot.body?.activeChildren ?? [];
  const ids = new Set([EXCHANGE_ROOT]);
  for (const c of children) {
    if (c?.id) ids.add(String(c.id));
  }
  return { ids, childCount: children.length, bootStatus: boot.status };
}

async function runCaseA(origin) {
  const r = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=all`
  );
  const posts = postsOf(r.body);
  return {
    case: "A",
    mode: "default_browse",
    pass: r.ok && posts.length > 0,
    detail: r.ok ? `count=${posts.length} first=${firstTitle(posts)}` : `http_${r.status}`,
    firstId: posts[0]?.id ?? null,
  };
}

async function runCaseB(origin, exchangeIds) {
  const feed = await fetchJson(
    `${origin}/api/trade/feed?tradeMarketParent=${encodeURIComponent(EXCHANGE_ROOT)}&page=1&sort=latest`
  );
  const philife = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=all&tradeMarketParentIds=${encodeURIComponent(EXCHANGE_ROOT)}`
  );
  const feedPosts = postsOf(feed.body);
  const philPosts = postsOf(philife.body);
  const feedCheck = allInSet(categoryIds(feedPosts), exchangeIds);
  const philCheck = allInSet(categoryIds(philPosts), exchangeIds);
  return {
    case: "B",
    mode: "root_browse_M-HARD",
    pass: feed.ok && philife.ok && feedCheck.pass && philCheck.pass,
    detail: {
      feed: { count: feedPosts.length, first: firstTitle(feedPosts), membership: feedCheck },
      philife: { count: philPosts.length, first: firstTitle(philPosts), membership: philCheck },
    },
  };
}

async function runCaseC(origin) {
  const boot = await fetchJson(
    `${origin}/api/categories/market-bootstrap?q=${encodeURIComponent(USED_CAR_ROOT)}`
  );
  const children = boot.body?.children ?? [];
  if (!children.length) {
    return {
      case: "C",
      mode: "topic_browse",
      pass: null,
      detail: "NOT_PROVEN — production TOPIC children=0 (data state)",
      status: "NOT_PROVEN",
    };
  }
  const topic = children[0];
  const feed = await fetchJson(
    `${origin}/api/trade/feed?tradeMarketParent=${encodeURIComponent(USED_CAR_ROOT)}&topic=${encodeURIComponent(topic.slug || topic.id)}&page=1&sort=latest`
  );
  const posts = postsOf(feed.body);
  const topicIds = new Set([String(topic.id)]);
  const check = allInSet(categoryIds(posts), topicIds);
  return {
    case: "C",
    mode: "topic_browse",
    pass: feed.ok && check.pass,
    detail: { topic: topic.slug || topic.id, count: posts.length, membership: check },
  };
}

async function runCaseD(origin) {
  const q = "Toyota Fortuner";
  const r = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=all&q=${encodeURIComponent(q)}`
  );
  const posts = postsOf(r.body);
  const titles = posts.slice(0, 10).map((p) => String(p.title || ""));
  const unrelatedExchange = titles.some((t) => /peso|php|환전|exchange/i.test(t));
  const hasFortuner = titles.some((t) => /fortuner|toyota/i.test(t));
  return {
    case: "D",
    mode: "text_search_T5-B",
    pass: r.ok && posts.length > 0 && hasFortuner && !unrelatedExchange,
    detail: {
      count: posts.length,
      first3: titles.slice(0, 3),
      unrelatedExchangeTail: unrelatedExchange,
      hasFortunerSignal: hasFortuner,
    },
  };
}

async function runCaseE(origin) {
  const q = "Toyota Fortuner";
  const r = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=all&q=${encodeURIComponent(q)}&tradeMarketParentIds=${encodeURIComponent(USED_CAR_ROOT)}`
  );
  const posts = postsOf(r.body);
  const usedCarBoot = await fetchJson(
    `${origin}/api/categories/market-bootstrap?q=${encodeURIComponent(USED_CAR_ROOT)}`
  );
  const allowed = new Set([USED_CAR_ROOT]);
  for (const c of usedCarBoot.body?.children ?? []) {
    if (c?.id) allowed.add(String(c.id));
  }
  const check = allInSet(categoryIds(posts), allowed);
  return {
    case: "E",
    mode: "search_plus_root",
    pass: r.ok && check.pass && posts.length >= 0,
    detail: { count: posts.length, membership: check, first: firstTitle(posts) },
  };
}

async function runCaseF(origin) {
  return {
    case: "F",
    mode: "search_plus_topic",
    pass: null,
    status: "NOT_PROVEN",
    detail: "Production TOPIC children=0 — search+TOPIC runtime deferred",
  };
}

async function runCaseG(origin) {
  const r = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=city&lgu=${PASIG}&tradeMarketParentIds=${encodeURIComponent(USED_CAR_ROOT)}&composition=${encodeURIComponent(JSON.stringify({ body_type: "suv" }))}`
  );
  const posts = postsOf(r.body);
  const suvMeta = posts.filter((p) => {
    const meta = p.meta && typeof p.meta === "object" ? p.meta : {};
    return String(meta.car_body_type || "").toLowerCase() === "suv";
  });
  return {
    case: "G",
    mode: "filter_combined_L-SOFT",
    pass: r.ok,
    detail: {
      count: posts.length,
      suvMetaCount: suvMeta.length,
      first: firstTitle(posts),
      note: "composition AND + city browse — membership/filter contract smoke only",
    },
  };
}

async function runCaseH(origin, exchangeIds) {
  const params = `tradeMarketParent=${encodeURIComponent(EXCHANGE_ROOT)}&page=1&sort=latest&location=city&lgu=${PASIG}`;
  const feed = await fetchJson(`${origin}/api/trade/feed?${params}`);
  const philife = await fetchJson(
    `${origin}/api/philife/posts?page=1&sort=latest&type=trade&location=city&lgu=${PASIG}&tradeMarketParentIds=${encodeURIComponent(EXCHANGE_ROOT)}`
  );
  const feedPosts = postsOf(feed.body);
  const philPosts = postsOf(philife.body);
  const feedIds = categoryIds(feedPosts);
  const philIds = categoryIds(philPosts);
  const feedMem = allInSet(feedIds, exchangeIds);
  const philMem = allInSet(philIds, exchangeIds);
  const sameFirst = feedPosts[0]?.id && feedPosts[0]?.id === philPosts[0]?.id;
  const overlap =
    feedIds.length > 0 && philIds.length > 0
      ? feedIds.filter((id) => philIds.includes(id)).length / Math.max(feedIds.length, philIds.length)
      : 0;
  return {
    case: "H",
    mode: "feed_philife_parity_L-SOFT",
    pass: feed.ok && philife.ok && feedMem.pass && philMem.pass && (sameFirst || overlap >= 0.5),
    detail: {
      feed: { count: feedPosts.length, first: firstTitle(feedPosts), membership: feedMem },
      philife: { count: philPosts.length, first: firstTitle(philPosts), membership: philMem },
      sameFirstId: sameFirst,
      idOverlapRatio: Number(overlap.toFixed(2)),
    },
  };
}

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const exchange = await resolveExchangeMembership(ORIGIN);
  const cases = [];
  cases.push(await runCaseA(ORIGIN));
  cases.push(await runCaseB(ORIGIN, exchange.ids));
  cases.push(await runCaseC(ORIGIN));
  cases.push(await runCaseD(ORIGIN));
  cases.push(await runCaseE(ORIGIN));
  cases.push(await runCaseF(ORIGIN));
  cases.push(await runCaseG(ORIGIN));
  cases.push(await runCaseH(ORIGIN, exchange.ids));

  const proven = cases.filter((c) => c.pass !== null);
  const passCount = proven.filter((c) => c.pass === true).length;
  const failCount = proven.filter((c) => c.pass === false).length;
  const notProven = cases.filter((c) => c.pass === null).length;

  const report = {
    cut: "SSOT-5",
    origin: ORIGIN,
    at: new Date().toISOString(),
    note: "Probes CURRENT Production deploy — SSOT code must ship via Git Integration before expecting full PASS.",
    exchangeMembership: { childCount: exchange.childCount, idCount: exchange.ids.size },
    summary: { pass: passCount, fail: failCount, notProven, total: cases.length },
    cases,
  };

  const outPath = path.join(OUT_DIR, "REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (failCount > 0) process.exit(2);
}

await main();
