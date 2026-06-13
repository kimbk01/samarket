import { afterEach, describe, expect, it } from "vitest";
import { isKakaoNativeExchangeSessionEnabled } from "@/lib/auth/native/kakao-auth-env.server";

describe("kakao-auth-env.server", () => {
  const originalFlag = process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED;
    } else {
      process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED = originalFlag;
    }
  });

  it("enables kakao native exchange by default when env unset", () => {
    delete process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED;
    expect(isKakaoNativeExchangeSessionEnabled()).toBe(true);
  });

  it("disables only when AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED is explicitly false", () => {
    process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED = "false";
    expect(isKakaoNativeExchangeSessionEnabled()).toBe(false);
  });
});
