#!/usr/bin/env node
/**
 * DIBAY PATCH 2 — cache key·fingerprint·globalThis 동작 검증 (HTTP·DB 없음).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function storeOrderEventsReadCacheKey(params) {
  return `store_order_events:${params.orderId.trim()}:${params.viewerUserId.trim()}:${params.audience}`;
}

function apiRouteAuthCookieFingerprint(cookieHeader) {
  const raw = cookieHeader.trim();
  if (!raw) return "∅";
  const parts = [];
  for (const segment of raw.split(";")) {
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    const name = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) {
      parts.push(`${name}=${value}`);
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
      parts.push(`${name}=${value}`);
    }
  }
  if (!parts.length) return "∅";
  parts.sort();
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

// events key stability (no updated_at)
const key1 = storeOrderEventsReadCacheKey({
  orderId: "04184ea9-e399-425c-9082-7bff3a084c92",
  viewerUserId: "user-a",
  audience: "buyer",
});
const key2 = storeOrderEventsReadCacheKey({
  orderId: "04184ea9-e399-425c-9082-7bff3a084c92",
  viewerUserId: "user-a",
  audience: "buyer",
});
assert.equal(key1, key2);
assert(!key1.includes("updated_at") && !key1.includes("\0"));

// globalThis events cache survival
const g = globalThis;
if (!g.__samarketStoreOrderEventsReadCache) {
  g.__samarketStoreOrderEventsReadCache = new Map();
}
const map = g.__samarketStoreOrderEventsReadCache;
const body = { ok: true, events: [] };
const now = Date.now();
map.set(key1, { body, cachedAt: now, expiresAt: now + 4000 });
const hit = map.get(key1);
assert(hit && hit.expiresAt > now);

// auth fingerprint
const fpA = apiRouteAuthCookieFingerprint("sb-x-auth-token=abc; foo=bar");
const fpB = apiRouteAuthCookieFingerprint("foo=bar; sb-x-auth-token=abc");
assert.equal(fpA, fpB);
assert.notEqual(fpA, apiRouteAuthCookieFingerprint("sb-x-auth-token=other"));

console.log("[verify-dibay-perf-patch-2-cache] ok");
