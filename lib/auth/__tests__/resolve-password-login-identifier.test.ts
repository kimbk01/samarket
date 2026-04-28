import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => mockTryCreateSupabaseServiceClient(),
}));

import { resolvePasswordLoginIdentifier } from "@/lib/auth/resolve-password-login-identifier";

type QueryResult = { data: unknown[] | null; error: { message?: string } | null };

function makeServiceClient(
  handler: (column: "username" | "auth_login_email" | "email", value: string) => Promise<QueryResult>
) {
  return {
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
  };
}

describe("resolvePasswordLoginIdentifier", () => {
  beforeEach(() => {
    mockTryCreateSupabaseServiceClient.mockReset();
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

  it("returns conflict when identifier lookup finds duplicates", async () => {
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
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("login_identifier_conflict");
      expect(res.status).toBe(409);
    }
  });

  it("returns not_found when username does not exist", async () => {
    mockTryCreateSupabaseServiceClient.mockReturnValue(
      makeServiceClient(async () => ({ error: null, data: [] }))
    );
    const res = await resolvePasswordLoginIdentifier("no-such-user");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("login_identifier_not_found");
      expect(res.status).toBe(404);
    }
  });
});
