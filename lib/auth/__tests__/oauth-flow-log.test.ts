import { describe, expect, it } from "vitest";
import { extractRedirectToFromAuthorizeUrl } from "@/lib/auth/oauth-flow-log";

describe("oauth-flow-log", () => {
  it("extracts redirect_to from authorize URL", () => {
    const authorizeUrl =
      "https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=dibay%3A%2F%2Fauth%2Fcallback";
    expect(extractRedirectToFromAuthorizeUrl(authorizeUrl)).toBe("dibay://auth/callback");
  });
});
