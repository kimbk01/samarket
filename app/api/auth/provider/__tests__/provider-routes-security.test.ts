import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthenticatedUserId = vi.fn();
const verifyProviderCredentialInput = vi.fn();
const completeProviderLink = vi.fn();
const resolveProviderLogin = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: () => requireAuthenticatedUserId(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));
vi.mock("@/lib/auth/provider-identity/provider-credential-verify.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/provider-identity/provider-credential-verify.server")>();
  return {
    ...actual,
    verifyProviderCredentialInput: (...args: unknown[]) => verifyProviderCredentialInput(...args),
  };
});
vi.mock("@/lib/auth/provider-identity/link-provider.server", () => ({
  completeProviderLink: (...args: unknown[]) => completeProviderLink(...args),
}));
vi.mock("@/lib/auth/provider-identity/resolve-provider-login.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/provider-identity/resolve-provider-login.server")>();
  return { ...actual, resolveProviderLogin: (...args: unknown[]) => resolveProviderLogin(...args) };
});

function post(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body) });
}

describe("provider routes security (P1-3 · P1-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_PROVIDER_LINK_TOKEN_SECRET", "unit-secret");
    completeProviderLink.mockResolvedValue({ ok: true, provider: "kakao" });
  });

  it("P1-3: conflict-check requires a session (401)", async () => {
    requireAuthenticatedUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const { POST } = await import("@/app/api/auth/provider/conflict-check/route");
    const res = await POST(post("https://x.test/api/auth/provider/conflict-check", { provider: "google", providerUserId: "g" }));
    expect(res.status).toBe(401);
    expect(resolveProviderLogin).not.toHaveBeenCalled();
  });

  it("P1-3: conflict-check never returns another member's userId", async () => {
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "me" });
    const { POST } = await import("@/app/api/auth/provider/conflict-check/route");

    resolveProviderLogin.mockResolvedValueOnce({ status: "existing", userId: "victim", identityId: "i", via: "user_auth_identities" });
    const existing = await (await POST(post("https://x.test/c", { provider: "google", providerUserId: "g" }))).json();
    expect(JSON.stringify(existing)).not.toContain("victim");
    expect(existing.linkedToCurrentUser).toBe(false);

    resolveProviderLogin.mockResolvedValueOnce({
      status: "email_conflict",
      conflict: { email: "a@b.com", attemptedProvider: "google", existingProviders: ["kakao"], existingUserId: "victim" },
    });
    const conflict = await (await POST(post("https://x.test/c", { provider: "google", providerUserId: "g" }))).json();
    expect(conflict).not.toHaveProperty("existingUserId");
    expect(JSON.stringify(conflict)).not.toContain("victim");
  });

  it("P1-4: link/complete rejects a stash bound to another member", async () => {
    const { createConflictStashToken } = await import("@/lib/auth/provider-identity/link-token.server");
    const stash = createConflictStashToken({ provider: "kakao", providerUserId: "k-attacker" }, "attacker");
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "victim" });
    const { POST } = await import("@/app/api/auth/provider/link/complete/route");
    const res = await POST(post("https://x.test/l", { provider: "kakao", stashToken: stash }));
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("provider_link_token_invalid");
    expect(completeProviderLink).not.toHaveBeenCalled();
  });

  it("P1-4: link/complete does not fall back to stash when a supplied credential fails verification", async () => {
    const { createConflictStashToken } = await import("@/lib/auth/provider-identity/link-token.server");
    const stash = createConflictStashToken({ provider: "kakao", providerUserId: "k-1" }, "me");
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "me" });
    verifyProviderCredentialInput.mockRejectedValue(new Error("bad token"));
    const { POST } = await import("@/app/api/auth/provider/link/complete/route");
    const res = await POST(post("https://x.test/l", { provider: "kakao", stashToken: stash, accessToken: "forged" }));
    expect(res.status).toBe(400);
    expect(completeProviderLink).not.toHaveBeenCalled();
  });

  it("P1-4: link/complete accepts a stash bound to the current member (no credential)", async () => {
    const { createConflictStashToken } = await import("@/lib/auth/provider-identity/link-token.server");
    const stash = createConflictStashToken({ provider: "kakao", providerUserId: "k-1" }, "me");
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "me" });
    const { POST } = await import("@/app/api/auth/provider/link/complete/route");
    const res = await POST(post("https://x.test/l", { provider: "kakao", stashToken: stash }));
    expect(res.status).toBe(200);
    expect(completeProviderLink).toHaveBeenCalledTimes(1);
  });

  it("P1-4: link/start rejects a stash bound to another member", async () => {
    const { createConflictStashToken } = await import("@/lib/auth/provider-identity/link-token.server");
    const stash = createConflictStashToken({ provider: "kakao", providerUserId: "k-1" }, "someone-else");
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "me" });
    const { POST } = await import("@/app/api/auth/provider/link/start/route");
    const res = await POST(post("https://x.test/s", { stashToken: stash }));
    expect(res.status).toBe(400);
  });
});
