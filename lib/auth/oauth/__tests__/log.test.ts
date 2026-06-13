import { describe, expect, it } from "vitest";
import {
  extractAuthorizeHost,
  extractRedirectToFromAuthorizeUrl,
} from "@/lib/auth/oauth/log";

describe("oauth log helpers", () => {
  it("extracts redirect_to from authorize URL", () => {
    const authorizeUrl =
      "https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=dibay%3A%2F%2Fauth%2Fcallback";
    expect(extractRedirectToFromAuthorizeUrl(authorizeUrl)).toBe("dibay://auth/callback");
  });

  it("extracts authorizeHost from authorize URL", () => {
    const authorizeUrl =
      "https://example.supabase.co/auth/v1/authorize?provider=kakao&redirect_to=dibay%3A%2F%2Fauth%2Fcallback";
    expect(extractAuthorizeHost(authorizeUrl)).toBe("example.supabase.co");
  });
});
