import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/** HTML 네비게이션 연속 hit — getClaims 로컬 검증 결과 (JWT 만료 전·쿠키 동일) */
export const PROXY_AUTH_SESSION_TTL_MS = 12_000;

type ProxyAuthCacheEntry = {
  userId: string;
  expiresAt: number;
};

type ProxyAuthCacheGlobal = {
  __samarketProxyAuthSessionCache?: Map<string, ProxyAuthCacheEntry>;
};

function cacheMap(): Map<string, ProxyAuthCacheEntry> {
  const g = globalThis as ProxyAuthCacheGlobal;
  if (!g.__samarketProxyAuthSessionCache) {
    g.__samarketProxyAuthSessionCache = new Map();
  }
  return g.__samarketProxyAuthSessionCache;
}

/** Supabase auth 쿠키만 해시 — 전체 Cookie 헤더와 분리해 불필요한 miss 방지 */
export function proxyAuthCookieFingerprint(request: NextRequest): string {
  const parts: string[] = [];
  for (const { name, value } of request.cookies.getAll()) {
    if (
      name.startsWith("sb-") &&
      (name.includes("auth-token") || name.includes("code-verifier"))
    ) {
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

export function peekProxyAuthSessionCache(fingerprint: string): string | null {
  const hit = cacheMap().get(fingerprint);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.userId;
}

export function setProxyAuthSessionCache(fingerprint: string, userId: string): void {
  const uid = userId.trim();
  if (!uid || !fingerprint || fingerprint === "∅") return;
  cacheMap().set(fingerprint, { userId: uid, expiresAt: Date.now() + PROXY_AUTH_SESSION_TTL_MS });
  while (cacheMap().size > 800) {
    const k = cacheMap().keys().next().value;
    if (k === undefined) break;
    cacheMap().delete(k);
  }
}

export function proxyAuthResolveFlightKey(fingerprint: string): string {
  return `proxy-auth-resolve:${fingerprint}`;
}

export async function runProxyAuthResolveSingleFlight<T>(
  fingerprint: string,
  fn: () => Promise<T>
): Promise<T> {
  return runSingleFlight(proxyAuthResolveFlightKey(fingerprint), fn);
}
