import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import type { AuthProviderPublic } from "@/lib/auth/auth-providers";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "auth_oauth_signing_in_label") return "Signing in…";
      if (key === "auth_provider_continue_google") return "Continue with Google";
      if (key === "auth_provider_continue_kakao") return "Continue with Kakao";
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

const kakaoProvider: AuthProviderPublic = {
  id: "2",
  provider: "kakao",
  enabled: true,
  client_id: "x",
  redirect_uri: "https://example.com",
  scope: "",
  sort_order: 2,
};

describe("LoginProviderButtons pending OAuth UI", () => {
  it("shows redirecting label and aria-busy for pending provider only", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[googleProvider, kakaoProvider]}
        pendingOAuthProvider="google"
        onSelectProvider={() => undefined}
      />,
    );
    expect(html).toContain("Signing in…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-provider="google"');
    expect(html).toContain('data-provider="kakao"');
    expect(html).toContain("disabled");
  });

  it("does not show redirecting when no provider is pending", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[googleProvider]}
        pendingOAuthProvider={null}
        onSelectProvider={() => undefined}
      />,
    );
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("Signing in…");
  });

  it("internal entry is a labeled secondary CTA when showEmailEntry", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[googleProvider]}
        showEmailEntry
        onEmailLoginClick={() => undefined}
        onSelectProvider={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="auth-internal-login-entry"');
    expect(html).toContain('data-auth-surface="internal"');
  });
});
