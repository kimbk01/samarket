import { describe, expect, it } from "vitest";
import {
  isKakaoOtherAccountIntent,
  normalizeKakaoLoginIntent,
  resolveKakaoNativeSignInPolicy,
  resolveKakaoWebOAuthPrompt,
} from "@/lib/auth/oauth/kakao-login-intent";

describe("kakao-login-intent SSOT", () => {
  it("normalizes intent aliases to other_account", () => {
    expect(normalizeKakaoLoginIntent("other_account")).toBe("other_account");
    expect(normalizeKakaoLoginIntent("other-account")).toBe("other_account");
    expect(normalizeKakaoLoginIntent("reauth")).toBe("other_account");
    expect(normalizeKakaoLoginIntent("normal")).toBe("normal");
    expect(normalizeKakaoLoginIntent(undefined)).toBe("normal");
    expect(normalizeKakaoLoginIntent("")).toBe("normal");
  });

  it("NORMAL prefers Talk and has no Account Prompt", () => {
    const policy = resolveKakaoNativeSignInPolicy("normal");
    expect(policy.preferKakaoTalk).toBe(true);
    expect(policy.accountPrompt).toBeNull();
    expect(isKakaoOtherAccountIntent(policy.intent)).toBe(false);
  });

  it("OTHER_ACCOUNT never prefers Talk and requires Prompt.LOGIN", () => {
    const policy = resolveKakaoNativeSignInPolicy("other_account");
    expect(policy.preferKakaoTalk).toBe(false);
    expect(policy.accountPrompt).toBe("login");
    expect(isKakaoOtherAccountIntent(policy.intent)).toBe(true);
  });

  it("Web/iOS Kakao OAuth uses prompt=login for both intents", () => {
    expect(resolveKakaoWebOAuthPrompt("normal")).toBe("login");
    expect(resolveKakaoWebOAuthPrompt("other_account")).toBe("login");
  });
});
