import { describe, expect, it, vi } from "vitest";
import { unlinkProvider } from "@/lib/auth/provider-identity/link-provider.server";

function mockSb(identities: Array<Record<string, unknown>>) {
  const from = vi.fn((table: string) => {
    if (table !== "user_auth_identities") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    }
    return {
      select: () => ({
        eq: () => ({
          order: async () => ({ data: identities, error: null }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null, count: 1 }),
        }),
      }),
    };
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("unlinkProvider", () => {
  it("blocks unlink when only one linkable provider remains", async () => {
    const sb = mockSb([
      { id: "1", user_id: "u1", provider: "google", provider_user_id: "g1" },
    ]);
    const result = await unlinkProvider(sb, "u1", "google");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("last_provider_unlink_blocked");
    }
  });

  it("allows unlink when multiple linkable providers exist", async () => {
    const sb = mockSb([
      { id: "1", user_id: "u1", provider: "google", provider_user_id: "g1" },
      { id: "2", user_id: "u1", provider: "kakao", provider_user_id: "k1" },
    ]);
    const result = await unlinkProvider(sb, "u1", "kakao");
    expect(result).toEqual({ ok: true });
  });
});
