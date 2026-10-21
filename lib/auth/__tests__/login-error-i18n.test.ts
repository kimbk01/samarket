import { describe, expect, it, vi } from "vitest";
import {
  mapAuthErrorMessage,
  mapPasswordLoginErrorMessage,
  resolveAuthAccountStatusNotice,
} from "@/lib/auth/login-error-i18n";
import { authUiMessages } from "@/lib/i18n/catalog/auth-ui";

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe("P2-15 §5.6 auth error mapping", () => {
  it("unknown code → generic retry key, code only in console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapAuthErrorMessage("weird_code_x", undefined, t)).toBe("auth_err_generic_retry");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("callback_failed never renders detail", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapAuthErrorMessage("callback_failed", "db exploded: relation x", t)).toBe("auth_err_callback_failed");
    warn.mockRestore();
  });

  it("raw Supabase password errors are not shown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapPasswordLoginErrorMessage("AuthApiError: Database error querying schema", t)).toBe("auth_err_login_failed");
    warn.mockRestore();
  });

  it("account status codes map to dedicated notice kinds", () => {
    expect(resolveAuthAccountStatusNotice("account_suspended")).toBe("suspended");
    expect(resolveAuthAccountStatusNotice("account_blocked")).toBe("blocked");
    expect(resolveAuthAccountStatusNotice("account_withdrawn")).toBe("withdrawn");
    expect(resolveAuthAccountStatusNotice("callback_failed")).toBeNull();
  });
});

describe("P2-15 auth-ui catalog", () => {
  const ko = authUiMessages.ko as Record<string, string>;
  const en = authUiMessages.en as Record<string, string>;

  it("ko/en key parity", () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });

  it("no raw {code}/{detail}/{message} placeholders or developer instructions", () => {
    for (const table of [ko, en]) {
      for (const value of Object.values(table)) {
        expect(value).not.toMatch(/\{(code|detail|message)\}/);
        expect(value).not.toMatch(/\.env|NEXT_PUBLIC_|Android Studio|Kakao Developers|GOOGLE_WEB_CLIENT_ID|anon/);
      }
    }
  });

  it("labels and title follow the SSOT", () => {
    expect(ko.auth_login_title).toBe("dibaY 시작하기");
    expect(ko.auth_login_auto_signup_hint).toBe("처음이면 자동으로 가입됩니다");
    expect(en.auth_login_auto_signup_hint).toBe("New here? Your account is created automatically.");
    expect(ko.auth_provider_continue_kakao).toBe("카카오 로그인");
    expect(en.auth_provider_continue_kakao).toBe("Login with Kakao");
    expect(ko.auth_provider_continue_google).toBe("Google로 계속하기");
    expect(en.auth_provider_continue_apple).toBe("Continue with Apple");
    expect(ko.auth_provider_email_conflict_login_existing).toBe("{provider}로 로그인");
  });

  it("suspended copy does not suggest another login method", () => {
    expect(ko.auth_err_account_suspended).not.toContain("다른 로그인");
    expect(en.auth_err_account_suspended).not.toMatch(/another sign-in/i);
  });
});
