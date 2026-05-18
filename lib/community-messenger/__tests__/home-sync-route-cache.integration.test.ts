/**
 * home-sync in-process route cache — bundle mock 으로 DB 없이 2·3회차 TTL 검증.
 * 실행: npx vitest run lib/community-messenger/__tests__/home-sync-route-cache.integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "00000000-0000-4000-8000-000000000001";

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: vi.fn(async () => ({ ok: true as const, userId: USER_ID })),
}));

vi.mock("@/lib/http/api-route", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/api-route")>();
  return {
    ...mod,
    enforceRateLimit: vi.fn(async () => ({ ok: true as const })),
    jsonOkWithRequest: (_req: unknown, body: unknown) =>
      Response.json(body, { status: 200 }),
  };
});

const bundleFactory = vi.fn(async () => ({
  chats: [{ id: "room-1" }],
  groups: [],
  friends: [],
  requests: [],
}));

vi.mock("@/lib/community-messenger/get-community-messenger-home-sync-bundle", () => ({
  getCommunityMessengerHomeSyncBundle: (...args: unknown[]) => bundleFactory(...args),
}));

describe("home-sync route in-process cache", () => {
  beforeEach(() => {
    vi.resetModules();
    bundleFactory.mockClear();
    delete process.env.SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("2·3회차 critical tier — bundle 1회, short_ttl_hit", async () => {
    const { GET } = await import("@/app/api/community-messenger/home-sync/route");
    const url = "http://localhost/api/community-messenger/home-sync?tier=critical";

    const t1 = performance.now();
    const r1 = await GET(new NextRequest(url));
    const ms1 = performance.now() - t1;
    expect(r1.status).toBe(200);
    expect(bundleFactory).toHaveBeenCalledTimes(1);

    const t2 = performance.now();
    const r2 = await GET(new NextRequest(url));
    const ms2 = performance.now() - t2;
    expect(r2.status).toBe(200);
    expect(bundleFactory).toHaveBeenCalledTimes(1);

    const t3 = performance.now();
    const r3 = await GET(new NextRequest(url));
    const ms3 = performance.now() - t3;
    expect(r3.status).toBe(200);
    expect(bundleFactory).toHaveBeenCalledTimes(1);

    expect(ms2).toBeLessThan(150);
    expect(ms3).toBeLessThan(150);
    expect(ms1).toBeGreaterThanOrEqual(ms2);
  });

  it("SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE=1 이면 매 요청 bundle 재실행", async () => {
    vi.stubEnv("SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE", "1");
    vi.resetModules();
    bundleFactory.mockClear();
    const { GET } = await import("@/app/api/community-messenger/home-sync/route");
    const url = "http://localhost/api/community-messenger/home-sync?tier=critical";
    await GET(new NextRequest(url));
    await GET(new NextRequest(url));
    expect(bundleFactory.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
