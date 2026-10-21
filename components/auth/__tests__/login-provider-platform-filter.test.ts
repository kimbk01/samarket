import { describe, expect, it } from "vitest";
import { filterLoginProvidersForPlatform } from "@/components/auth/login-provider-platform-filter";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";

function row(provider: OAuthProvider, sort_order = 1): AuthProviderPublic {
  return { id: provider, provider, enabled: true, client_id: "x", redirect_uri: "https://e", scope: "", sort_order };
}

const all = [row("google"), row("kakao"), row("apple"), row("naver"), row("facebook")];

describe("P1-14 filterLoginProvidersForPlatform", () => {
  it("never shows Naver/Facebook (web)", () => {
    const r = filterLoginProvidersForPlatform(all, {
      shellPlatform: null,
      resolveRoutingAction: () => "web_oauth_start",
    });
    expect(r.providers.map((p) => p.provider)).toEqual(["google", "kakao", "apple"]);
    expect(r.iosAppleMissing).toBe(false);
  });

  it("hides providers whose routing is native_blocked", () => {
    const r = filterLoginProvidersForPlatform(all, {
      shellPlatform: "android",
      resolveRoutingAction: (p) => (p === "google" ? "native_blocked" : "native_provider_login"),
    });
    expect(r.providers.map((p) => p.provider)).toEqual(["kakao", "apple"]);
  });

  it("iOS shell without Apple hides every social button", () => {
    const r = filterLoginProvidersForPlatform([row("google"), row("kakao")], {
      shellPlatform: "ios",
      resolveRoutingAction: () => "web_oauth_start",
    });
    expect(r.providers).toEqual([]);
    expect(r.iosAppleMissing).toBe(true);
  });

  it("iOS shell where Apple native is unavailable (native_blocked) also hides other social buttons", () => {
    const r = filterLoginProvidersForPlatform([row("google"), row("apple")], {
      shellPlatform: "ios",
      resolveRoutingAction: (p) => (p === "apple" ? "native_blocked" : "web_oauth_start"),
    });
    expect(r.providers).toEqual([]);
    expect(r.iosAppleMissing).toBe(true);
  });

  it("iOS shell with Apple keeps Apple and other routable providers", () => {
    const r = filterLoginProvidersForPlatform([row("google"), row("kakao"), row("apple")], {
      shellPlatform: "ios",
      resolveRoutingAction: (p) => (p === "apple" ? "native_provider_login" : "web_oauth_start"),
    });
    expect(r.providers.map((p) => p.provider)).toEqual(["google", "kakao", "apple"]);
  });
});
