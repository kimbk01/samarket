import { describe, expect, it } from "vitest";
import { resolvePlatformEventCtaLabel } from "@/lib/platform-events/platform-event-cta-label";
import { translate } from "@/lib/i18n/messages";

const HANGUL = /[가-힣]/;

describe("resolvePlatformEventCtaLabel — 빈 값·옛 코드·옛 고정 문장 → 키", () => {
  it("옛 코드 view_details · 옛 「자세히 보기」 · 「View details」 는 지금 언어로", () => {
    for (const stored of ["view_details", "자세히 보기", translate("en", "ptr_ad_cta_default")]) {
      const en = resolvePlatformEventCtaLabel(stored, "en");
      expect(en).toBe(translate("en", "ptr_ad_cta_default"));
      expect(HANGUL.test(en ?? "")).toBe(false);
      expect(resolvePlatformEventCtaLabel(stored, "ko")).toBe(translate("ko", "ptr_ad_cta_default"));
    }
  });

  it("사장님 신청 이벤트(defaultWhenEmpty)의 빈 값은 기본 키", () => {
    const en = resolvePlatformEventCtaLabel(null, "en", { defaultWhenEmpty: true });
    expect(en).toBe(translate("en", "ptr_ad_cta_default"));
    expect(HANGUL.test(en ?? "")).toBe(false);
    expect(resolvePlatformEventCtaLabel("  ", "ko", { defaultWhenEmpty: true })).toBe(
      translate("ko", "ptr_ad_cta_default"),
    );
  });

  it("관리자가 쓴 이름은 그대로 · 관리자 이벤트 빈 값은 null(버튼 숨김 유지)", () => {
    expect(resolvePlatformEventCtaLabel("지금 참여하기", "en")).toBe("지금 참여하기");
    expect(resolvePlatformEventCtaLabel("  ", "ko")).toBeNull();
    expect(resolvePlatformEventCtaLabel(null, "ko")).toBeNull();
  });
});
