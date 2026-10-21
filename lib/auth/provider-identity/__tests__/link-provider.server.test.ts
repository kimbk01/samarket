import { describe, expect, it, vi } from "vitest";
import {
  isRecentSignInForSensitiveAction,
  unlinkProvider,
} from "@/lib/auth/provider-identity/link-provider.server";

function mockSb(
  identities: Array<Record<string, unknown>>,
  profile: Record<string, unknown> | null = null,
  profileUpdate = vi.fn(),
) {
  const from = vi.fn((table: string) => {
    if (table !== "user_auth_identities") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
        update: (patch: Record<string, unknown>) => {
          profileUpdate(patch);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
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

  it("OA-16: unlink clears profiles fallback only when profiles.provider is the unlinked provider", async () => {
    const profileUpdate = vi.fn();
    const sb = mockSb(
      [
        { id: "1", user_id: "u1", provider: "google", provider_user_id: "g1" },
        { id: "2", user_id: "u1", provider: "kakao", provider_user_id: "k1" },
      ],
      { provider: "kakao", provider_user_id: "k1" },
      profileUpdate,
    );
    await unlinkProvider(sb, "u1", "kakao");
    expect(profileUpdate).toHaveBeenCalledWith(expect.objectContaining({ provider_user_id: null }));
  });

  it("OA-16: unlink keeps profiles identity of a different primary provider", async () => {
    const profileUpdate = vi.fn();
    const sb = mockSb(
      [
        { id: "1", user_id: "u1", provider: "google", provider_user_id: "g1" },
        { id: "2", user_id: "u1", provider: "kakao", provider_user_id: "k1" },
      ],
      { provider: "google", provider_user_id: "g1" },
      profileUpdate,
    );
    await unlinkProvider(sb, "u1", "kakao");
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("OA-16: recent sign-in window is 10 minutes", () => {
    const now = Date.parse("2026-10-21T10:00:00Z");
    expect(isRecentSignInForSensitiveAction("2026-10-21T09:55:00Z", now)).toBe(true);
    expect(isRecentSignInForSensitiveAction("2026-10-21T09:49:00Z", now)).toBe(false);
    expect(isRecentSignInForSensitiveAction(null, now)).toBe(false);
    expect(isRecentSignInForSensitiveAction("garbage", now)).toBe(false);
  });
});
