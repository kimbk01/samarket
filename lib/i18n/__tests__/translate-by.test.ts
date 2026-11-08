import { describe, expect, it } from "vitest";
import { translateBy } from "@/lib/i18n/translate-by";

describe("translateBy — 원래 언어 삼항과 같은 동작", () => {
  it("en·ko 는 그 언어, 그 외는 otherwise", () => {
    expect(translateBy("en", "common_confirm")).toBe("Confirm");
    expect(translateBy("ko", "common_confirm")).toBe("확인");
    expect(translateBy(undefined, "common_confirm")).toBe("확인");
    expect(translateBy("fil", "common_confirm", undefined, "en")).toBe("Confirm");
  });

  it("치환값은 템플릿 문자열처럼 String() 으로", () => {
    expect(translateBy("ko", "mypage_comp_phone_resend_in_seconds" as never, { seconds: null })).toBe("재발송 nulls");
    expect(translateBy("en", "mypage_comp_phone_resend_in_seconds" as never, { seconds: 3 })).toBe("Resend 3s");
  });
});
