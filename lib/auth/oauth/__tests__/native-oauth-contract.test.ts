import { describe, expect, it, vi } from "vitest";
import {
  buildValidatedNativeAppCallbackUrl,
  endOAuthFlow,
  isOAuthFlowInFlight,
  isOAuthInFlightPath,
  isOAuthLaunchPath,
  OAUTH_FLOW_IN_FLIGHT_TTL_MS,
  releaseOAuthFlowOnUserCancel,
  resetOAuthFlowForTests,
  shouldBridgeCapacitorReturnToApp,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";

describe("native-oauth-contract", () => {
  it("detects OAuth launch and in-flight paths", () => {
    expect(isOAuthLaunchPath("/auth/oauth/launch")).toBe(true);
    expect(isOAuthInFlightPath("/auth/callback")).toBe(true);
    expect(isOAuthInFlightPath("/mypage")).toBe(false);
  });

  it("bridges only when code or error is present", () => {
    expect(shouldBridgeCapacitorReturnToApp("?code=abc&provider=google", "")).toBe(true);
    expect(shouldBridgeCapacitorReturnToApp("?error=access_denied", "")).toBe(true);
    expect(shouldBridgeCapacitorReturnToApp("?provider=google", "")).toBe(false);
    expect(buildValidatedNativeAppCallbackUrl("?provider=google", "")).toBeNull();
    expect(buildValidatedNativeAppCallbackUrl("?code=abc", "")).toBe(
      "dibay://auth/callback?code=abc",
    );
    expect(buildValidatedNativeAppCallbackUrl("?code=abc&provider=naver", "")).toBe(
      "dibay://auth/callback?code=abc&provider=naver",
    );
  });

  it("oauth flow mutex allows single in-flight start", () => {
    resetOAuthFlowForTests();
    expect(isOAuthFlowInFlight()).toBe(false);
    const first = tryBeginOAuthFlow("google");
    expect(first.ok).toBe(true);
    expect(isOAuthFlowInFlight()).toBe(true);
    const second = tryBeginOAuthFlow("google");
    expect(second.ok).toBe(false);
    endOAuthFlow();
    expect(isOAuthFlowInFlight()).toBe(false);
  });

  it("oauth flow release clears the matching provider lock", () => {
    resetOAuthFlowForTests();
    const flow = tryBeginOAuthFlow("kakao");
    expect(flow.ok).toBe(true);
    if (flow.ok) flow.release();
    expect(isOAuthFlowInFlight()).toBe(false);
  });

  it("oauth flow blocks other providers while any provider is in-flight", () => {
    resetOAuthFlowForTests();
    expect(tryBeginOAuthFlow("google").ok).toBe(true);
    const kakao = tryBeginOAuthFlow("kakao");
    expect(kakao.ok).toBe(false);
    if (!kakao.ok) {
      expect(kakao.inFlightProvider).toBe("google");
    }
  });

  it("oauth flow lock expires by TTL", () => {
    resetOAuthFlowForTests();
    const now = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    expect(tryBeginOAuthFlow("apple").ok).toBe(true);
    dateSpy.mockReturnValue(now + OAUTH_FLOW_IN_FLIGHT_TTL_MS + 1);
    expect(isOAuthFlowInFlight()).toBe(false);
    expect(tryBeginOAuthFlow("naver").ok).toBe(true);
    dateSpy.mockRestore();
  });

  it("releaseOAuthFlowOnUserCancel clears lock immediately", () => {
    resetOAuthFlowForTests();
    expect(tryBeginOAuthFlow("google").ok).toBe(true);
    expect(isOAuthFlowInFlight()).toBe(true);
    releaseOAuthFlowOnUserCancel();
    expect(isOAuthFlowInFlight()).toBe(false);
    expect(tryBeginOAuthFlow("kakao").ok).toBe(true);
  });
});
