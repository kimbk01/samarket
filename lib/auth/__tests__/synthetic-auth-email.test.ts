import { describe, expect, it } from "vitest";
import {
  inferAuthProviderFromSyntheticEmail,
  inferProviderUserIdFromSyntheticAuthEmail,
  isDibaySyntheticAuthEmail,
  pickContactEmailForProfile,
} from "@/lib/auth/synthetic-auth-email";

describe("synthetic-auth-email", () => {
  it("detects native and manual synthetic auth emails", () => {
    expect(isDibaySyntheticAuthEmail("kakao.4944733937@kakao.native.dibay.internal")).toBe(true);
    expect(isDibaySyntheticAuthEmail("ops@manual.local")).toBe(true);
    expect(isDibaySyntheticAuthEmail("user@gmail.com")).toBe(false);
  });

  it("infers provider and user id from synthetic emails", () => {
    expect(inferAuthProviderFromSyntheticEmail("kakao.4944733937@kakao.native.dibay.internal")).toBe("kakao");
    expect(
      inferProviderUserIdFromSyntheticAuthEmail("kakao.4944733937@kakao.native.dibay.internal"),
    ).toBe("4944733937");
  });

  it("pickContactEmailForProfile skips synthetic fallbacks", () => {
    expect(
      pickContactEmailForProfile(
        null,
        "kakao.4944733937@kakao.native.dibay.internal",
        "kakao.user@example.com",
      ),
    ).toBe("kakao.user@example.com");
    expect(pickContactEmailForProfile("kakao.4944733937@kakao.native.dibay.internal")).toBeNull();
  });
});
