import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTryCreateSupabaseServiceClient = vi.fn();
const mockHasActiveAdminMembership = vi.fn();

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => mockTryCreateSupabaseServiceClient(),
}));

vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembership: (...args: unknown[]) => mockHasActiveAdminMembership(...args),
}));

import { resolvePasswordLoginIdentifier } from "@/lib/auth/resolve-password-login-identifier";

type QueryResult = { data: unknown[] | null; error: { message?: string } | null };
type AuthUserResult = { data: { user: { email?: string | null } | null }; error: { message?: string } | null };

function makeServiceClient(
  handler: (column: "username" | "auth_login_email" | "email", value: string) => Promise<QueryResult>,
  authUsers: Record<string, string> = {},
) {
  const getUserById = vi.fn(async (id: string): Promise<AuthUserResult> => {
    const email = authUsers[id];
    if (email === undefined) return { data: { user: null }, error: { message: "not found" } };
    return { data: { user: { email } }, error: null };
  });
  return {
    getUserById,
    from: () => ({
      select: () => ({
        ilike: (_column: string, value: string) => ({
          limit: async () => handler("username", value),
        }),
        eq: (column: string, value: string) => ({
          limit: async () => handler(column as "auth_login_email" | "email", value),
        }),
      }),
    }),
    auth: { admin: { getUserById } },
  };
}

const ISSUED_ROW = {
  id: "39fcc298-0e5c-48da-bb47-28ce90db595a",
  username: "dibay_63292c",
  auth_login_email: "appreview01@manual.local",
  provider: "admin_manual",
  auth_provider: "admin_manual",
};

describe("resolvePasswordLoginIdentifier", () => {
  beforeEach(() => {
    mockTryCreateSupabaseServiceClient.mockReset();
    mockHasActiveAdminMembership.mockReset();
    mockHasActiveAdminMembership.mockResolvedValue(false);
  });

  it("returns direct email when service client is unavailable", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(null);
    const res = await resolvePasswordLoginIdentifier("TestUser@Example.COM");
    expect(res).toEqual({ ok: true, identifier: "testuser@example.com" });
  });

  it("resolves username with case-insensitive lookup and auth_login_email", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async (column, value) => {
        if (column === "username") {
          expect(value).toBe("mixedid");
          return {
            error: null,
            data: [
              {
                username: "MixedID",
                auth_login_email: "MixedID@manual.local",
                provider: "admin_manual",
              },
            ],
          };
        }
        return { error: null, data: [] };
      })
    );
    const res = await resolvePasswordLoginIdentifier("MixedID");
    expect(res).toEqual({ ok: true, identifier: "mixedid@manual.local" });
  });

  it("issued manual ID still signs in after auto DIBAY ID replaced username (Auth UID verified)", async () => {
    const client = makeServiceClient(
      async (column, value) => {
        if (column === "auth_login_email" && value === "appreview01@manual.local") {
          return { error: null, data: [ISSUED_ROW] };
        }
        return { error: null, data: [] };
      },
      { [ISSUED_ROW.id]: "appreview01@manual.local" },
    );
    mockTryCreateSupabaseServiceClient.mockReturnValue(client);
    const res = await resolvePasswordLoginIdentifier("AppReview01");
    expect(res).toEqual({ ok: true, identifier: "appreview01@manual.local" });
    expect(client.getUserById).toHaveBeenCalledWith(ISSUED_ROW.id);
  });

  it("issued ID wins over another member who later took the same display username", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(
        async (column) => {
          if (column === "auth_login_email") return { error: null, data: [ISSUED_ROW] };
          if (column === "username") {
            return {
              error: null,
              data: [{ id: "other", username: "appreview01", auth_login_email: "other@manual.local", provider: "admin_manual" }],
            };
          }
          return { error: null, data: [] };
        },
        { [ISSUED_ROW.id]: "appreview01@manual.local" },
      ),
    );
    const res = await resolvePasswordLoginIdentifier("appreview01");
    expect(res).toEqual({ ok: true, identifier: "appreview01@manual.local" });
  });

  it("does not trust the issued-ID profile row when Auth email for that UID differs", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(
        async (column) => {
          if (column === "auth_login_email") return { error: null, data: [ISSUED_ROW] };
          return { error: null, data: [] };
        },
        { [ISSUED_ROW.id]: "someone-else@manual.local" },
      ),
    );
    const res = await resolvePasswordLoginIdentifier("appreview01");
    expect(res).toEqual({ ok: true, identifier: "appreview01@manual.local" });
  });

  it("ignores non-manual rows on the issued-ID path", async () => {
    const client = makeServiceClient(
      async (column) => {
        if (column === "auth_login_email") {
          return { error: null, data: [{ ...ISSUED_ROW, provider: "kakao", auth_provider: "kakao" }] };
        }
        return { error: null, data: [] };
      },
      { [ISSUED_ROW.id]: "appreview01@manual.local" },
    );
    mockTryCreateSupabaseServiceClient.mockReturnValue(client);
    await resolvePasswordLoginIdentifier("appreview01");
    expect(client.getUserById).not.toHaveBeenCalled();
  });

  it("fails open to user email when profile lookup errors", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async (column) => {
        if (column === "auth_login_email") return { error: { message: "db down" }, data: null };
        return { error: null, data: [] };
      })
    );
    const res = await resolvePasswordLoginIdentifier("normal.user@example.com");
    expect(res).toEqual({ ok: true, identifier: "normal.user@example.com" });
  });

  it("duplicate username does not disclose the conflict (generic sign-in failure path)", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async (column) => {
        if (column === "username") {
          return {
            error: null,
            data: [
              { username: "sameid", auth_login_email: "sameid@manual.local" },
              { username: "sameid", auth_login_email: "sameid2@manual.local" },
            ],
          };
        }
        return { error: null, data: [] };
      })
    );
    const res = await resolvePasswordLoginIdentifier("sameid");
    expect(res).toEqual({ ok: true, identifier: "sameid@manual.local" });
  });

  it("unknown ID gets the same response shape as an issued ID (no existence disclosure)", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async () => ({ error: null, data: [] }))
    );
    const res = await resolvePasswordLoginIdentifier("no-such-user");
    expect(res).toEqual({ ok: true, identifier: "no-such-user@manual.local" });
  });

  it("keeps social-only members out of password login without revealing the account", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async (column) => {
        if (column === "username") {
          return {
            error: null,
            data: [
              {
                id: "member-social-1",
                username: "snsuser",
                auth_login_email: "sns.user@kakao.native.dibay.internal",
                provider: "kakao",
                auth_provider: "kakao",
              },
            ],
          };
        }
        return { error: null, data: [] };
      })
    );
    mockHasActiveAdminMembership.mockResolvedValue(false);
    const res = await resolvePasswordLoginIdentifier("snsuser");
    expect(res).toEqual({ ok: true, identifier: "snsuser@manual.local" });
    expect(mockHasActiveAdminMembership).toHaveBeenCalledWith(expect.anything(), "member-social-1");
  });

  it("allows password login for social provider when active admin membership exists", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async (column) => {
        if (column === "username") {
          return {
            error: null,
            data: [
              {
                id: "e6e35c51-39a5-41d0-a95a-8294ed0b3da5",
                username: "bbk1122",
                auth_login_email: "kakao.user@kakao.native.dibay.internal",
                provider: "kakao",
                auth_provider: "kakao",
              },
            ],
          };
        }
        return { error: null, data: [] };
      })
    );
    mockHasActiveAdminMembership.mockResolvedValue(true);
    const res = await resolvePasswordLoginIdentifier("Bbk1122");
    expect(res).toEqual({
      ok: true,
      identifier: "kakao.user@kakao.native.dibay.internal",
    });
    expect(mockHasActiveAdminMembership).toHaveBeenCalledWith(
      expect.anything(),
      "e6e35c51-39a5-41d0-a95a-8294ed0b3da5"
    );
  });
});
