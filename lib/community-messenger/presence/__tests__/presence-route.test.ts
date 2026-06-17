/**
 * presence route — upsert only, soft-timeout, no service.ts import
 * 실행: npx vitest run lib/community-messenger/presence/__tests__/presence-route.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const upsertMock = vi.fn(async (_sb: unknown, _input: unknown) => ({ ok: true as const }));
const getSnapshotsMock = vi.fn(async (_sb: unknown, _ids: unknown) => new Map());

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalRouteHandlerCookieAuth: vi.fn(async () => ({
    userId: USER_ID,
    user: null,
    claimsOnly: false,
    supabase: { from: vi.fn() },
  })),
}));

vi.mock("@/lib/http/api-route", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/api-route")>();
  return {
    ...mod,
    enforceRateLimit: vi.fn(async () => ({ ok: true as const })),
  };
});

vi.mock("@/lib/community-messenger/presence/presence-store", () => ({
  PRESENCE_UPSERT_SOFT_TIMEOUT_MS: 50,
  upsertPresenceSnapshot: (sb: unknown, input: unknown) => upsertMock(sb, input),
  getPresenceSnapshotsByUserIds: (sb: unknown, ids: unknown) => getSnapshotsMock(sb, ids),
}));

describe("POST /api/community-messenger/presence", () => {
  beforeEach(() => {
    vi.resetModules();
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ ok: true });
    getSnapshotsMock.mockReset();
    getSnapshotsMock.mockResolvedValue(new Map());
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("정상 upsert 200 + serverTime", async () => {
    const { POST } = await import("@/app/api/community-messenger/presence/route");
    const req = new NextRequest("http://localhost/api/community-messenger/presence", {
      method: "POST",
      body: JSON.stringify({ status: "online", surface: "home" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; serverTime?: string };
    expect(json.ok).toBe(true);
    expect(json.serverTime).toBeTruthy();
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("DB 지연 시 soft timeout 202", async () => {
    upsertMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 200))
    );
    const { POST } = await import("@/app/api/community-messenger/presence/route");
    const req = new NextRequest("http://localhost/api/community-messenger/presence", {
      method: "POST",
      body: JSON.stringify({ status: "online", surface: "home" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { ok: boolean; softFailed?: boolean };
    expect(json.ok).toBe(false);
    expect(json.softFailed).toBe(true);
  });

  it("인증 없음 401", async () => {
    const authMod = await import("@/lib/auth/get-optional-authenticated-user-id");
    vi.mocked(authMod.getOptionalRouteHandlerCookieAuth).mockResolvedValueOnce({
      userId: null,
      user: null,
      claimsOnly: false,
      supabase: null,
    });
    const { POST } = await import("@/app/api/community-messenger/presence/route");
    const req = new NextRequest("http://localhost/api/community-messenger/presence", {
      method: "POST",
      body: JSON.stringify({ status: "online" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("100회 연속 호출 — timeout 없이 빠르게 완료", async () => {
    const { POST } = await import("@/app/api/community-messenger/presence/route");
    const t0 = performance.now();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => {
        const req = new NextRequest("http://localhost/api/community-messenger/presence", {
          method: "POST",
          body: JSON.stringify({ status: "online", surface: "home" }),
        });
        return POST(req);
      })
    );
    const elapsed = performance.now() - t0;
    expect(results.every((r) => r.status === 200 || r.status === 202)).toBe(true);
    expect(elapsed).toBeLessThan(5_000);
  });
});
