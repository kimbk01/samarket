/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import type { AuthProviderPublic } from "@/lib/auth/auth-providers";
import type { LoginProviderSelectOptions } from "@/components/auth/LoginProviderButtons";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "auth_oauth_signing_in_label") return "Signing in…";
      if (key === "auth_provider_continue_kakao") return "Continue with Kakao";
      if (key === "auth_provider_continue_google") return "Continue with Google";
      if (key === "auth_provider_continue_apple") return "Continue with Apple";
      if (key === "auth_provider_kakao_other_account") return "Sign in with another Kakao account";
      return key;
    },
  }),
}));

const kakaoProvider: AuthProviderPublic = {
  id: "2",
  provider: "kakao",
  enabled: true,
  client_id: "x",
  redirect_uri: "https://example.com",
  scope: "",
  sort_order: 2,
};

const googleProvider: AuthProviderPublic = {
  id: "1",
  provider: "google",
  enabled: true,
  client_id: "x",
  redirect_uri: "https://example.com",
  scope: "",
  sort_order: 1,
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

describe("LoginProviderButtons Kakao intent actuation", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("normal CTA invokes kakaoIntent=normal; other-account invokes other_account", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectProvider = vi.fn();

    act(() => {
      root.render(
        <LoginProviderButtons
          providers={[googleProvider, kakaoProvider, appleProvider]}
          onSelectProvider={onSelectProvider}
        />,
      );
    });

    const group = container.querySelector('[data-testid="auth-kakao-provider-group"]');
    expect(group).toBeTruthy();
    const normal = group!.querySelector('[data-testid="auth-kakao-normal"]') as HTMLButtonElement;
    const other = group!.querySelector(
      '[data-testid="auth-kakao-other-account"]',
    ) as HTMLButtonElement;
    expect(normal).toBeTruthy();
    expect(other).toBeTruthy();
    expect(group!.contains(normal)).toBe(true);
    expect(group!.contains(other)).toBe(true);
    expect(group!.querySelector('[data-provider="apple"]')).toBeNull();
    expect(group!.querySelector('[data-provider="google"]')).toBeNull();

    act(() => {
      normal.click();
    });
    expect(onSelectProvider).toHaveBeenCalledWith("kakao", {
      kakaoIntent: "normal",
    } satisfies LoginProviderSelectOptions);

    act(() => {
      other.click();
    });
    expect(onSelectProvider).toHaveBeenCalledWith("kakao", {
      kakaoIntent: "other_account",
    } satisfies LoginProviderSelectOptions);
  });

  it("blocks double-submit while OAuth is in flight", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectProvider = vi.fn();

    act(() => {
      root.render(
        <LoginProviderButtons
          providers={[kakaoProvider]}
          pendingOAuthProvider="kakao"
          pendingKakaoIntent="normal"
          onSelectProvider={onSelectProvider}
        />,
      );
    });

    const other = container.querySelector(
      '[data-testid="auth-kakao-other-account"]',
    ) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    act(() => {
      other.click();
    });
    expect(onSelectProvider).not.toHaveBeenCalled();
  });
});
