// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearNativeLoginInFlight,
  consumeInterruptedNativeLogin,
  markNativeLoginInFlight,
} from "@/lib/auth/native/native-login-interrupt-marker.client";

describe("native login interrupt marker (프로세스 재시작 판정)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("SDK 결과가 돌아오면 표식이 지워져 재시작 시 중단으로 판정하지 않는다", () => {
    markNativeLoginInFlight("kakao");
    clearNativeLoginInFlight();
    expect(consumeInterruptedNativeLogin()).toBeNull();
  });

  it("결과 없이 프로세스가 끝나면 다음 시작 때 1회만 중단으로 판정한다", () => {
    markNativeLoginInFlight("kakao");
    expect(consumeInterruptedNativeLogin()).toBe("kakao");
    expect(consumeInterruptedNativeLogin()).toBeNull();
  });
});
