import { describe, expect, it, beforeEach } from "vitest";
import {
  markProxySignupComplete,
  peekProxySignupComplete,
  PROXY_AUTH_SESSION_TTL_MS,
  setProxyAuthSessionCache,
  invalidateProxyAuthSessionCacheForUser,
} from "@/lib/auth/proxy-auth-session-cache";
import { isHtmlPrefetchRequest } from "@/lib/auth/proxy-signup-gate";
import type { NextRequest } from "next/server";

describe("B4 / D-2 proxy signup complete warm", () => {
  const fp = "fp-b4-signup";

  beforeEach(() => {
    invalidateProxyAuthSessionCacheForUser();
  });

  it("complete flag is false until marked; survives identity refresh for same user", () => {
    setProxyAuthSessionCache(fp, "user-a");
    expect(peekProxySignupComplete(fp)).toBe(false);
    markProxySignupComplete(fp);
    expect(peekProxySignupComplete(fp)).toBe(true);
    setProxyAuthSessionCache(fp, "user-a");
    expect(peekProxySignupComplete(fp)).toBe(true);
    expect(PROXY_AUTH_SESSION_TTL_MS).toBe(12_000);
  });

  it("lifecycle invalidation clears complete", () => {
    setProxyAuthSessionCache(fp, "user-a");
    markProxySignupComplete(fp);
    invalidateProxyAuthSessionCacheForUser("user-a");
    expect(peekProxySignupComplete(fp)).toBe(false);
  });

  it("isHtmlPrefetchRequest detects purpose and next-router-prefetch", () => {
    const prefetch = {
      headers: {
        get: (name: string) =>
          name === "purpose" ? "prefetch" : name === "next-router-prefetch" ? null : null,
      },
    } as unknown as NextRequest;
    expect(isHtmlPrefetchRequest(prefetch)).toBe(true);
    const nextPrefetch = {
      headers: {
        get: (name: string) => (name === "next-router-prefetch" ? "1" : null),
      },
    } as unknown as NextRequest;
    expect(isHtmlPrefetchRequest(nextPrefetch)).toBe(true);
    const nav = {
      headers: { get: () => null },
    } as unknown as NextRequest;
    expect(isHtmlPrefetchRequest(nav)).toBe(false);
  });
});
