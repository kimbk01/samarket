import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserById = vi.fn();
const unlinkProvider = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ auth: { admin: { getUserById } } }),
}));
vi.mock("@/lib/auth/provider-identity/link-provider.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/provider-identity/link-provider.server")>();
  return { ...actual, unlinkProvider: (...args: unknown[]) => unlinkProvider(...args) };
});

function call(provider: string) {
  return import("@/app/api/me/auth-providers/[provider]/route").then(({ DELETE }) =>
    DELETE(new NextRequest(`https://x.test/api/me/auth-providers/${provider}`, { method: "DELETE" }), {
      params: Promise.resolve({ provider }),
    }),
  );
}

describe("DELETE /api/me/auth-providers/[provider] (OA-16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unlinkProvider.mockResolvedValue({ ok: true });
  });

  it("403 reauth_required when last sign-in is older than 10 minutes", async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: "u1", last_sign_in_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() } },
      error: null,
    });
    const res = await call("kakao");
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("reauth_required");
    expect(unlinkProvider).not.toHaveBeenCalled();
  });

  it("allows unlink right after sign-in", async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: "u1", last_sign_in_at: new Date(Date.now() - 60 * 1000).toISOString() } },
      error: null,
    });
    const res = await call("kakao");
    expect(res.status).toBe(200);
    expect(unlinkProvider).toHaveBeenCalledTimes(1);
  });
});
