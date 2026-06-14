import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isApplePrivateRelayEmail,
  isEmailEligibleForConflictMatch,
  normalizeProviderEmail,
} from "@/lib/auth/provider-identity/email-policy";
import { resolveProviderLogin } from "@/lib/auth/provider-identity/resolve-provider-login.server";

function mockSb(rows: {
  identities?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
}) {
  const identityRows = rows.identities ?? [];
  const profileRows = rows.profiles ?? [];

  const from = vi.fn((table: string) => {
    const state: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        state[col] = val;
        return builder;
      }),
      neq: vi.fn((col: string, val: unknown) => {
        state[`neq:${col}`] = val;
        return builder;
      }),
      ilike: vi.fn((col: string, val: unknown) => {
        state[`ilike:${col}`] = val;
        return builder;
      }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === "user_auth_identities") {
          const match = identityRows.find((row) => {
            if (state.provider && row.provider !== state.provider) return false;
            if (state.provider_user_id && row.provider_user_id !== state.provider_user_id) return false;
            if (state.user_id && row.user_id !== state.user_id) return false;
            if (state[`neq:provider`] && row.provider === state[`neq:provider`]) return false;
            if (state.email) {
              const email = String(row.email ?? "").toLowerCase();
              if (email !== String(state.email).toLowerCase()) return false;
            }
            if (state[`ilike:email`]) {
              const email = String(row.email ?? "").toLowerCase();
              if (email !== String(state[`ilike:email`]).toLowerCase()) return false;
            }
            if (state.email_is_private_relay === false && row.email_is_private_relay === true) return false;
            return true;
          });
          return { data: match ?? null, error: null };
        }
        if (table === "profiles") {
          const match = profileRows.find((row) => {
            if (state.provider && row.provider !== state.provider) return false;
            if (state.provider_user_id && row.provider_user_id !== state.provider_user_id) return false;
            return true;
          });
          return { data: match ?? null, error: null };
        }
        return { data: null, error: null };
      }),
      then: undefined,
    };
    (builder as { then?: unknown }).then = undefined;
    Object.defineProperty(builder, "then", {
      get() {
        return (resolve: (v: unknown) => void) => {
          if (table === "user_auth_identities" && !state.provider_user_id) {
            const filtered = identityRows.filter((row) => {
              if (state.user_id && row.user_id !== state.user_id) return false;
              if (state[`neq:provider`] && row.provider === state[`neq:provider`]) return false;
              if (state[`eq:email`] || state.email) {
                const target = String(state[`eq:email`] ?? state.email).toLowerCase();
                const email = String(row.email ?? "").toLowerCase();
                if (email !== target) return false;
              }
              if (state[`ilike:email`]) {
                const email = String(row.email ?? "").toLowerCase();
                if (email !== String(state[`ilike:email`]).toLowerCase()) return false;
              }
              if (state.email_is_private_relay === false && row.email_is_private_relay === true) return false;
              return true;
            });
            resolve({ data: filtered, error: null });
            return;
          }
          resolve({ data: [], error: null });
        };
      },
    });
    return builder;
  });

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("email-policy", () => {
  it("detects Apple private relay emails", () => {
    expect(isApplePrivateRelayEmail("abc@privaterelay.appleid.com")).toBe(true);
    expect(isEmailEligibleForConflictMatch("abc@privaterelay.appleid.com")).toBe(false);
    expect(normalizeProviderEmail("  Test@Gmail.COM ")).toBe("test@gmail.com");
  });
});

describe("resolveProviderLogin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing when provider_user_id already linked", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-1",
          provider: "google",
          provider_user_id: "gid-1",
          email: "a@gmail.com",
          email_is_private_relay: false,
        },
      ],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "gid-1",
      email: "a@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("existing");
    if (result.status === "existing") {
      expect(result.userId).toBe("user-1");
    }
  });

  it("returns email_conflict instead of auto-merge for same email different provider", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-kakao",
          provider: "kakao",
          provider_user_id: "kakao-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "google-new",
      email: "same@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("email_conflict");
  });

  it("skips email conflict for Kakao without email", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "g-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "kakao",
      providerUserId: "kakao-new",
      email: null,
    });
    expect(result.status).toBe("new");
  });

  it("skips email match for Apple private relay", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "g-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "apple",
      providerUserId: "apple-sub",
      email: "relay@privaterelay.appleid.com",
      emailIsPrivateRelay: true,
    });
    expect(result.status).toBe("new");
  });
});
