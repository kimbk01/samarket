/**
 * D-08 (광고 3차 재감사 · 2026-11-07) — 커뮤니티 상위노출 결제 창 문구 = 거래와 같은 뜻.
 * 노출 규칙(11-05 a35dbb5a7): 피드 위쪽 자리는 1개(가장 최근 결제), 나머지는 제자리에 「포인트 노출」 배지.
 * 옛 문구는 「피드 상단에 N일간 우선 노출」을 약속했다.
 */
import { describe, expect, it } from "vitest";
import { listMemberPromotionProductSeeds } from "@/lib/points/promotion-products";
import { translate } from "@/lib/i18n/messages";
import { memberPromotionProductTitle } from "@/lib/points/promotion-product-title";

const KEYS = [
  "promo_sheet_surface_community_home",
  "promo_sheet_surface_community_topic",
  "promo_sheet_community_immediate_note",
  "philife_write_ad_product_top_fixed_desc",
] as const;

const FORBIDDEN_KO = /상단에\s*(\S+\s*)?우선 노출|피드 상단/;
const FORBIDDEN_EN = /priority at (the )?top|feed top|at the top of the feed/i;

describe("D-08 커뮤니티 상위노출 문구", () => {
  /** TB-01·TB-02 (2026-11-26): 상품 설명은 코드에 두지 않고 노출 규칙 단일 문구 2개만 쓴다 */
  it("노출 규칙 문구: 위쪽 1자리 · 가장 최근 결제 · 뒤 결제 시 제자리 표시 (ko·en)", () => {
    const trade = translate("ko", "trade_ad_where_boost");
    expect(trade).toContain("1자리");
    expect(trade).toContain("가장 최근에 결제한 글");
    expect(trade).toContain("'광고'");
    const community = translate("ko", "promo_sheet_where_community");
    expect(community).toContain("1자리");
    expect(community).toContain("'포인트 노출'");
    expect(community).not.toMatch(FORBIDDEN_KO);
    expect(translate("en", "trade_ad_where_boost")).toMatch(/One top spot/);
    expect(translate("en", "promo_sheet_where_community")).toMatch(/One top spot/);
    expect(translate("en", "promo_sheet_where_community")).not.toMatch(FORBIDDEN_EN);
  });

  it("상품 이름 = 키 + DB 기간 · 코드 처음 값에 이름·설명 없음", () => {
    for (const p of listMemberPromotionProductSeeds()) {
      expect(Object.keys(p)).not.toContain("fallbackTitleKo");
      expect(Object.keys(p)).not.toContain("fallbackDescKo");
      const ko = memberPromotionProductTitle("ko", { domain: p.domain, durationDays: 5 });
      expect(ko).toContain("5일");
    }
    expect(memberPromotionProductTitle("ko", { domain: "community", durationDays: 3 })).toBe("커뮤니티 상위노출 3일");
    expect(memberPromotionProductTitle("en", { domain: "trade", durationDays: 14 })).toBe("Trade top exposure · 14 days");
  });

  it.each(KEYS)("%s: 결제 창 문구에 「상단 우선 노출」 약속 없음 (ko·en)", (key) => {
    const ko = translate("ko", key, { days: 7 });
    const en = translate("en", key, { days: 7 });
    expect(ko).not.toMatch(FORBIDDEN_KO);
    expect(en).not.toMatch(FORBIDDEN_EN);
  });

  it("안내 문구·작성 화면 상품 설명에 「1개」 · 「포인트 노출」", () => {
    for (const key of ["promo_sheet_community_immediate_note", "philife_write_ad_product_top_fixed_desc"] as const) {
      expect(translate("ko", key, { days: 3 })).toContain("1개(가장 최근 결제)");
      expect(translate("ko", key, { days: 3 })).toContain("‘포인트 노출’");
      expect(translate("en", key, { days: 3 })).toMatch(/One top spot per feed/);
    }
    expect(translate("ko", "philife_write_ad_product_top_fixed_desc", { days: 3 })).toContain("3일간");
  });
});
