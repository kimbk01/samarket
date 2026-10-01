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
      if (key === "auth_provider_continue_apple") return "Continue with Apple";
      if (key === "auth_provider_kakao_other_account") return "Sign in with another Kakao account";
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

const appleProvider: AuthProviderPublic = {
  id: "3",
  provider: "apple",
  enabled: true,
  client_id: "x",
  redirect_uri: "https://example.com",
  scope: "",
  sort_order: 3,
};

function sliceKakaoGroup(html: string): string {
  const marker = 'data-testid="auth-kakao-provider-group"';
  const markerIdx = html.indexOf(marker);
  expect(markerIdx).toBeGreaterThanOrEqual(0);
  const from = html.lastIndexOf("<div", markerIdx);
  expect(from).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let end = html.length;
  for (let idx = from; idx < html.length; idx++) {
    if (html.startsWith("<div", idx)) {
      depth += 1;
      idx += 3;
      continue;
    }
    if (html.startsWith("</div>", idx)) {
      depth -= 1;
      if (depth === 0) {
        end = idx + "</div>".length;
        break;
      }
      idx += 5;
    }
  }
  return html.slice(from, end);
}

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

  it("renders Kakao other-account CTA when kakao is enabled", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[kakaoProvider]}
        pendingOAuthProvider={null}
        onSelectProvider={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="auth-kakao-other-account"');
    expect(html).toContain('data-kakao-intent="other_account"');
    expect(html).toContain("Sign in with another Kakao account");
    expect(html).toContain('data-kakao-intent="normal"');
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

describe("LoginProviderButtons Kakao provider group structure", () => {
  it("keeps normal + other-account inside the same Kakao group with no Apple/Google between", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[googleProvider, kakaoProvider, appleProvider]}
        pendingOAuthProvider={null}
        onSelectProvider={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="auth-kakao-provider-group"');
    expect(html).toContain('data-auth-provider-group="kakao"');

    const group = sliceKakaoGroup(html);
    expect(group).toContain('data-testid="auth-kakao-normal"');
    expect(group).toContain('data-kakao-intent="normal"');
    expect(group).toContain('data-testid="auth-kakao-other-account"');
    expect(group).toContain('data-kakao-intent="other_account"');
    expect(group).not.toContain('data-provider="google"');
    expect(group).not.toContain('data-provider="apple"');

    const normalIdx = html.indexOf('data-kakao-intent="normal"');
    const otherIdx = html.indexOf('data-kakao-intent="other_account"');
    const googleIdx = html.indexOf('data-provider="google"');
    const appleIdx = html.indexOf('data-provider="apple"');
    expect(normalIdx).toBeGreaterThanOrEqual(0);
    expect(otherIdx).toBeGreaterThan(normalIdx);
    // Apple/Google must not sit between the two Kakao intents
    expect(googleIdx < normalIdx || googleIdx > otherIdx).toBe(true);
    expect(appleIdx < normalIdx || appleIdx > otherIdx).toBe(true);
  });

  it("other-account CTA uses outline action classes, not muted caption-only styling", () => {
    const html = renderToStaticMarkup(
      <LoginProviderButtons
        providers={[kakaoProvider]}
        onSelectProvider={() => undefined}
      />,
    );
    const group = sliceKakaoGroup(html);
    expect(group).toContain("sam-btn");
    expect(group).toContain("sam-btn--outline");
    expect(group).toContain("min-h-11");
    expect(group).toContain("border-sam-border");
    expect(group).toContain("bg-sam-surface");
    expect(group).not.toMatch(/auth-kakao-other-account[^>]*text-sam-muted/);
  });
});
