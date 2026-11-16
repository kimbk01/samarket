import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_FAILURE_MAX_ELAPSED_MS,
  parseAppleAuthorizationErrorCode,
  sanitizeAuthFailureTelemetryEvent,
} from "@/lib/telemetry/auth-failure-telemetry-contract";
import {
  beginAuthLifecycleFlow,
  cancelAuthLifecycle,
  completeAuthLifecycle,
  failAuthLifecycle,
  markAuthLifecycleStage,
  resetAuthLifecycleForTests,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import {
  installAuthLoginFailureTelemetry,
  resetAuthFailureTelemetryForTests,
} from "@/lib/telemetry/auth-failure-telemetry.client";

const base = {
  v: 1,
  authFlowId: "af_0123456789ab",
  result: "fail",
  provider: "apple",
  platform: "ios",
  elapsedMs: 1234,
};

describe("sanitizeAuthFailureTelemetryEvent", () => {
  it("화이트리스트 필드만 남긴다 (이메일·토큰·설명 원문 버림)", () => {
    const e = sanitizeAuthFailureTelemetryEvent({
      ...base,
      errorCode: "apple_native_config_error",
      nativeErrorCode: 1000,
      email: "a@b.c",
      identityToken: "x.y.z",
      message: "The operation couldn’t be completed.",
    });
    expect(e).not.toBeNull();
    expect(Object.keys(e!)).not.toContain("email");
    expect(Object.keys(e!)).not.toContain("identityToken");
    expect(Object.keys(e!)).not.toContain("message");
    expect(e!.nativeErrorCode).toBe(1000);
    expect(e!.errorCode).toBe("apple_native_config_error");
  });

  it("필수값이 틀리면 버린다", () => {
    expect(sanitizeAuthFailureTelemetryEvent({ ...base, v: 2 })).toBeNull();
    expect(sanitizeAuthFailureTelemetryEvent({ ...base, authFlowId: "user-123" })).toBeNull();
    expect(sanitizeAuthFailureTelemetryEvent({ ...base, result: "ok" })).toBeNull();
    expect(sanitizeAuthFailureTelemetryEvent({ ...base, elapsedMs: -1 })).toBeNull();
  });

  it("토큰 모양이 아닌 문자열은 null, 걸린 시간은 상한 고정", () => {
    const e = sanitizeAuthFailureTelemetryEvent({ ...base, reason: "has space", elapsedMs: 9e12 });
    expect(e!.reason).toBeNull();
    expect(e!.elapsedMs).toBe(AUTH_FAILURE_MAX_ELAPSED_MS);
  });
});

describe("parseAppleAuthorizationErrorCode", () => {
  it("영어·한국어 설명에서 번호만", () => {
    expect(
      parseAppleAuthorizationErrorCode(
        "The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)"
      )
    ).toBe(1000);
    expect(
      parseAppleAuthorizationErrorCode("작업을 완료할 수 없습니다.(com.apple.AuthenticationServices.AuthorizationError 오류 1001.)")
    ).toBe(1001);
  });

  it("번호가 없으면 null", () => {
    expect(parseAppleAuthorizationErrorCode("apple_native_config_error")).toBeNull();
    expect(parseAppleAuthorizationErrorCode(undefined)).toBeNull();
  });
});

describe("로그인 흐름 → 실패 기록 송신", () => {
  afterEach(() => {
    resetAuthLifecycleForTests();
    resetAuthFailureTelemetryForTests();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const sendBeacon = vi.fn((_url: string, _data: Blob) => true);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { sendBeacon });
    installAuthLoginFailureTelemetry();
    return sendBeacon;
  }

  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
  }

  async function bodyOf(sendBeacon: ReturnType<typeof vi.fn>, i = 0) {
    const blob = sendBeacon.mock.calls[i][1] as Blob;
    return JSON.parse(await blob.text()) as Record<string, unknown>;
  }

  it("fail 은 1회 송신 — 오류 번호 포함, summary 원문 미포함", async () => {
    const sendBeacon = await setup();
    beginAuthLifecycleFlow({ provider: "apple", platform: "ios" });
    markAuthLifecycleStage("provider_ui_presented");
    failAuthLifecycle("apple_native_config_error", {
      summary: { code: "apple_native_config_error", reason: "secret text" },
      nativeErrorCode: 1000,
    });
    await flush();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/telemetry/auth-failure");
    const body = await bodyOf(sendBeacon);
    expect(body).toMatchObject({
      result: "fail",
      provider: "apple",
      platform: "ios",
      errorCode: "apple_native_config_error",
      lastStage: "provider_ui_presented",
      nativeErrorCode: 1000,
    });
    expect(JSON.stringify(body)).not.toContain("secret text");
    expect(sanitizeAuthFailureTelemetryEvent(body)).not.toBeNull();
  });

  it("cancel 도 송신, ok 는 송신 안 함, 같은 흐름은 한 번만", async () => {
    const sendBeacon = await setup();
    beginAuthLifecycleFlow({ provider: "kakao", platform: "android" });
    completeAuthLifecycle("ok");
    await flush();
    expect(sendBeacon).not.toHaveBeenCalled();

    beginAuthLifecycleFlow({ provider: "apple", platform: "ios" });
    cancelAuthLifecycle({ reason: "user_cancelled" });
    cancelAuthLifecycle({ reason: "user_cancelled" });
    await flush();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(await bodyOf(sendBeacon)).toMatchObject({ result: "cancel", reason: "user_cancelled" });
  });
});
