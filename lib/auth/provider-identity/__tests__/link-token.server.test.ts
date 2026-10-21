import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConflictStashToken,
  createProviderLinkToken,
  verifyConflictStashToken,
  verifyProviderLinkToken,
} from "@/lib/auth/provider-identity/link-token.server";
import type { ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";

const candidate: ProviderIdentityCandidate = { provider: "kakao", providerUserId: "k-1", email: "a@b.com" };

describe("link-token.server (P1-4 · OA-13)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_PROVIDER_LINK_TOKEN_SECRET", "unit-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stash is bound to the conflict target member", () => {
    const stash = createConflictStashToken(candidate, "victim-user");
    expect(verifyConflictStashToken(stash, "victim-user")).toEqual(candidate);
    expect(verifyConflictStashToken(stash, "attacker-user")).toBeNull();
  });

  it("stash payload does not expose the bound user id", () => {
    const stash = createConflictStashToken(candidate, "victim-user-uuid");
    const decoded = Buffer.from(stash.split(".")[0] ?? "", "base64url").toString("utf8");
    expect(decoded).not.toContain("victim-user-uuid");
  });

  it("unbound stash is never accepted", () => {
    const stash = createConflictStashToken(candidate);
    expect(verifyConflictStashToken(stash, "any-user")).toBeNull();
  });

  it("token types use separate HMAC keys (stash ≠ link token)", () => {
    const { linkToken } = createProviderLinkToken("u1", candidate);
    expect(verifyConflictStashToken(linkToken, "u1")).toBeNull();
    const stash = createConflictStashToken(candidate, "u1");
    expect(verifyProviderLinkToken(stash, "u1")).toBeNull();
    expect(verifyProviderLinkToken(linkToken, "u1")?.candidate).toEqual(candidate);
    expect(verifyProviderLinkToken(linkToken, "u2")).toBeNull();
  });

  it("OA-13: no hard-coded secret fallback — fails closed", () => {
    vi.stubEnv("AUTH_PROVIDER_LINK_TOKEN_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => createProviderLinkToken("u1", candidate)).toThrow("provider_link_token_secret_missing");
    const stash = createConflictStashToken(candidate, "u1");
    expect(verifyConflictStashToken(stash, "u1")).toBeNull();
    errorSpy.mockRestore();
  });

  it("falls back to SUPABASE_SERVICE_ROLE_KEY when dedicated secret is unset", () => {
    vi.stubEnv("AUTH_PROVIDER_LINK_TOKEN_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const stash = createConflictStashToken(candidate, "u1");
    expect(verifyConflictStashToken(stash, "u1")).toEqual(candidate);
  });
});
