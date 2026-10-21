import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isKakaoNativeExchangeSessionEnabled,
  readKakaoAppIdEnv,
} from "@/lib/auth/native/kakao-auth-env.server";

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

  it("readKakaoAppIdEnv parses numeric KAKAO_APP_ID only", () => {
    vi.stubEnv("KAKAO_APP_ID", "");
    expect(readKakaoAppIdEnv()).toBeNull();
    vi.stubEnv("KAKAO_APP_ID", "12x");
    expect(readKakaoAppIdEnv()).toBeNull();
    vi.stubEnv("KAKAO_APP_ID", " 4321 ");
    expect(readKakaoAppIdEnv()).toBe(4321);
    vi.unstubAllEnvs();
  });
});
