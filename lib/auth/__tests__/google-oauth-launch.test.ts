import { describe, expect, it } from "vitest";
import { isEmbeddedOAuthUserAgent } from "@/lib/auth/google-oauth-launch";

describe("isEmbeddedOAuthUserAgent", () => {
  it("treats Android WebView as embedded", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.210 Mobile Safari/537.36";
    expect(isEmbeddedOAuthUserAgent(ua)).toBe(true);
  });

  it("treats Instagram in-app browser as embedded", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.21.114";
    expect(isEmbeddedOAuthUserAgent(ua)).toBe(true);
  });

  it("allows iOS Safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
    expect(isEmbeddedOAuthUserAgent(ua)).toBe(false);
  });

  it("allows desktop Chrome", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(isEmbeddedOAuthUserAgent(ua)).toBe(false);
  });
});
