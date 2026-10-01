import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import type { AuthProviderPublic } from "@/lib/auth/auth-providers";
import { DEFAULT_AUTH_LOGIN_SETTINGS } from "@/lib/auth/login-settings";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "auth_oauth_signing_in_label") return "Signing in…";
      if (key === "auth_provider_continue_google") return "Continue with Google";
      if (key === "auth_provider_continue_kakao") return "Continue with Kakao";
      if (key === "auth_login_divider_other_account") return "Continue with another account";
      if (key === "auth_login_divider_id_password") return "Or internal / operations login";
      if (key === "auth_login_internal_entry") return "Internal / operations login";
      if (key === "auth_login_email_dev_aria") return "Internal / operations account sign-in";
      return key;
    },
  }),
}));

const googleProvider: AuthProviderPublic = {
  id: "1",
  provider: "google",
  enabled: true,
  client_id: "x",
  redirect_uri: "https://example.com",
  scope: "",
  sort_order: 1,
};

describe("customer / internal login surface separation", () => {
  it("customer primary shows social CTA; internal is explicit text entry (not default form)", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[googleProvider]}
        showEmailEntry
        onEmailLoginClick={() => undefined}
        onSelectProvider={() => undefined}
      />,
    );
    expect(html).toContain('data-auth-customer-surface="social-primary"');
    expect(html).toContain("Continue with Google");
    expect(html).toContain('data-auth-surface="internal"');
    expect(html).toContain("Internal / operations login");
    expect(html).toContain("Or internal / operations login");
    // Must not look like a primary email-signup circle in the social row
    expect(html).not.toMatch(/data-provider="email"/);
  });

  it("without showEmailEntry, internal CTA is absent", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons providers={[googleProvider]} onSelectProvider={() => undefined} />,
    );
    expect(html).not.toContain('data-auth-surface="internal"');
  });

  it("defaults: password/manual is secondary sort after social providers", () => {
    const password = DEFAULT_AUTH_LOGIN_SETTINGS.find((s) => s.provider === "password");
    const google = DEFAULT_AUTH_LOGIN_SETTINGS.find((s) => s.provider === "google");
    expect(password?.label).toMatch(/내부|Internal|operations|운영/i);
    expect(password?.sort_order).toBeGreaterThan(google?.sort_order ?? 0);
  });

  it("source: LoginPage / AuthModal hide password form until internal entry", () => {
    const login = readFileSync(join(process.cwd(), "app/login/LoginPageClient.tsx"), "utf8");
    const modal = readFileSync(join(process.cwd(), "components/auth/AuthModal.tsx"), "utf8");
    expect(login).toMatch(/useState\(false\)/);
    expect(login).toMatch(/showEmailEntry=\{passwordEnabled && !showEmailLogin\}/);
    expect(login).toMatch(/data-auth-surface="internal"/);
    expect(modal).toMatch(/showEmailEntry=\{passwordEnabled && !showEmailLogin\}/);
    expect(modal).toMatch(/data-auth-surface="internal"/);
    // Backend auth paths unchanged in these surface files
    expect(login).toMatch(/signInWithPassword/);
    expect(login).toMatch(/password-login\/resolve-identifier/);
  });
});
