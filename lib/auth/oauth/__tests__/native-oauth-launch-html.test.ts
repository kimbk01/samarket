import { describe, expect, it } from "vitest";
import { buildNativeOAuthLaunchHtml } from "@/lib/auth/oauth/native-oauth-launch-html.server";

describe("buildNativeOAuthLaunchHtml", () => {
  it("embeds authorizeUrl and provider button without redirect hop", () => {
    const html = buildNativeOAuthLaunchHtml({
      authorizeUrl: "https://supabase.example/auth/v1/authorize?provider=google",
      provider: "google",
    });

    expect(html).toContain("Google로 계속하기");
    expect(html).toContain("Plugins.Browser");
    expect(html).toContain("https://supabase.example/auth/v1/authorize?provider=google");
    expect(html).not.toContain("/auth/oauth/native-launch/open");
  });
});
