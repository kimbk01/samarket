import { describe, expect, it } from "vitest";
import { mapNativeExchangeFailure } from "@/lib/auth/native/post-native-exchange.client";

describe("mapNativeExchangeFailure", () => {
  it("maps google exchange disabled to google_native_exchange_not_ready", () => {
    const mapped = mapNativeExchangeFailure("google", {
      ok: false,
      errorCode: "google_native_exchange_disabled",
      message: "disabled",
    });
    expect(mapped.provider).toBe("google");
    expect(mapped.code).toBe("google_native_exchange_not_ready");
  });

  it("maps kakao account conflict", () => {
    const mapped = mapNativeExchangeFailure("kakao", {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "conflict",
    });
    expect(mapped.code).toBe("kakao_native_account_conflict");
  });
});
