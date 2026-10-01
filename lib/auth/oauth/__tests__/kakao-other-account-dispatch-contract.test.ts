import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("kakao other-account native dispatch contract", () => {
  it("Android plugin: OTHER_ACCOUNT uses Prompt.LOGIN Account path and never Talk-first", () => {
    const java = read("android/app/src/main/java/com/dibay/app/NativeKakaoAuthPlugin.java");
    expect(java).toContain('INTENT_OTHER_ACCOUNT = "other_account"');
    expect(java).toContain("Prompt.LOGIN");
    expect(java).toContain("Collections.singletonList(Prompt.LOGIN)");

    const otherAccountBlock = java.slice(
      java.indexOf('if (INTENT_OTHER_ACCOUNT.equals(intent))'),
      java.indexOf("if (UserApiClient.getInstance().isKakaoTalkLoginAvailable"),
    );
    expect(otherAccountBlock).toContain("startKakaoAccountLogin");
    expect(otherAccountBlock).toContain("Prompt.LOGIN");
    expect(otherAccountBlock).not.toContain("startKakaoTalkLogin");
    expect(otherAccountBlock).not.toContain("loginWithKakaoTalk");

    expect(java).toContain("kakao_native_talk_blocked_other_account");
    expect(java).toMatch(/loginWithKakaoTalk/);
  });

  it("TS bridge passes explicit intent into native signIn", () => {
    const plugin = read("lib/auth/native/native-kakao-auth-plugin.ts");
    expect(plugin).toContain('invokeNativeKakaoPlugin<NativeKakaoAuthPluginSignInResult>("signIn", { intent })');

    const start = read("lib/auth/native/start-native-kakao-login.client.ts");
    expect(start).toContain("invokeNativeKakaoSignIn({ intent })");
    expect(start).toContain("kakao_login_intent_other_account");

    const provider = read("lib/auth/native/start-native-provider-login.client.ts");
    expect(provider).toContain("kakaoIntent");
    expect(provider).toContain("normalizeKakaoLoginIntent(input.kakaoIntent)");
  });

  it("Login UI exposes other-account CTA and wires intent", () => {
    const ui = read("components/auth/LoginProviderButtons.tsx");
    expect(ui).toContain('data-kakao-intent="other_account"');
    expect(ui).toContain('data-testid="auth-kakao-other-account"');
    expect(ui).toContain('kakaoIntent: "other_account"');
    expect(ui).toContain("auth_provider_kakao_other_account");
  });

  it("useOAuthLogin forwards kakaoIntent into native provider login", () => {
    const hook = read("lib/auth/oauth/use-oauth-login.ts");
    expect(hook).toContain("kakaoIntent");
    expect(hook).toContain("startNativeProviderLogin({");
    expect(hook).toMatch(/kakaoIntent,/);
  });

  it("logout still uses SDK logout not unlink", () => {
    const java = read("android/app/src/main/java/com/dibay/app/NativeKakaoAuthPlugin.java");
    expect(java).toContain("UserApiClient.getInstance().logout");
    expect(java).not.toMatch(/\.unlink\(/);

    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("revokeNativeKakaoSessionIfAvailable");
  });

  it("iOS plugin other_account uses Prompt.Login and skips Talk-first", () => {
    const swift = read("ios/App/App/Plugins/NativeKakaoAuthPlugin.swift");
    expect(swift).toContain('intent == "other_account"');
    expect(swift).toContain("loginWithKakaoAccount(prompts: [.Login])");
    const otherBlock = swift.slice(
      swift.indexOf('if intent == "other_account"'),
      swift.indexOf("if UserApi.isKakaoTalkLoginAvailable()"),
    );
    expect(otherBlock).not.toContain("loginWithKakaoTalk");
  });
});
