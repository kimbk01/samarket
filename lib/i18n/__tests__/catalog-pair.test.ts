import { describe, expect, it } from "vitest";
import { catalogPair } from "@/lib/i18n/catalog-pair";

describe("catalogPair", () => {
  it("카탈로그 ko·en 값을 그대로 담는다", () => {
    expect(catalogPair("common_confirm")).toEqual({ ko: "확인", en: "Confirm" });
    expect(catalogPair("mypage_comp_phone_resend_in_seconds" as never, { seconds: 3 })).toEqual({ ko: "재발송 3s", en: "Resend 3s" });
  });
});
