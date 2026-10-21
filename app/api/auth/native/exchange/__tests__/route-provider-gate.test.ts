import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let providerRow: Record<string, unknown> | null = null;
const exchangeNativeProviderToken = vi.fn();

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: providerRow, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/auth/native/native-token-exchange.server", () => ({
  createNativeExchangeContext: () => ({}),
  exchangeNativeProviderToken: (...args: unknown[]) => exchangeNativeProviderToken(...args),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({}) }));

function post(body: unknown) {
  return new NextRequest("https://x.test/api/auth/native/exchange", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/auth/native/exchange provider gate (OA-14) · conflict payload (P1-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    providerRow = { provider: "kakao", enabled: true };
  });

  it("403 provider_disabled when auth_providers.enabled=false", async () => {
    providerRow = { provider: "kakao", enabled: false };
    const { POST } = await import("@/app/api/auth/native/exchange/route");
    const res = await POST(post({ provider: "kakao", accessToken: "t" }));
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("provider_disabled");
    expect(exchangeNativeProviderToken).not.toHaveBeenCalled();
  });

  it("facebook is always rejected", async () => {
    providerRow = { provider: "facebook", enabled: true };
    const { POST } = await import("@/app/api/auth/native/exchange/route");
    const res = await POST(post({ provider: "facebook", accessToken: "t" }));
    expect(res.status).toBe(403);
  });

  it("conflict response never carries existingUserId", async () => {
    exchangeNativeProviderToken.mockResolvedValue({
      ok: false,
      errorCode: "provider_email_conflict",
      message: "m",
      status: 409,
      conflict: {
        email: "a@b.com",
        attemptedProvider: "kakao",
        existingProviders: ["google"],
        existingUserId: "victim-uuid",
        stashToken: "s",
      },
    });
    const { POST } = await import("@/app/api/auth/native/exchange/route");
    const res = await POST(post({ provider: "kakao", accessToken: "t" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.conflict).toEqual({
      email: "a@b.com",
      attemptedProvider: "kakao",
      existingProviders: ["google"],
      stashToken: "s",
    });
    expect(JSON.stringify(body)).not.toContain("victim-uuid");
  });
});
