/**
 * D-08 (광고 3차 재감사 · 2026-11-07) — 커뮤니티 상위노출 결제 창 문구 = 거래와 같은 뜻.
 * 노출 규칙(11-05 a35dbb5a7): 피드 위쪽 자리는 1개(가장 최근 결제), 나머지는 제자리에 「포인트 노출」 배지.
 * 옛 문구는 「피드 상단에 N일간 우선 노출」을 약속했다.
 */
import { describe, expect, it } from "vitest";
import { listMemberPromotionProductSeeds } from "@/lib/points/promotion-products";
import { translate } from "@/lib/i18n/messages";

const KEYS = [
  "promo_sheet_surface_community_home",
  "promo_sheet_surface_community_topic",
  "promo_sheet_community_immediate_note",
  "philife_write_ad_product_top_fixed_desc",
] as const;

const FORBIDDEN_KO = /상단에\s*(\S+\s*)?우선 노출|피드 상단/;
const FORBIDDEN_EN = /priority at (the )?top|feed top|at the top of the feed/i;

describe("D-08 커뮤니티 상위노출 문구", () => {
  it.each(["community_promote_3", "community_promote_7"] as const)("%s 설명: 「1개」 포함 · 「상단에 우선 노출」 없음 (ko·en)", (id) => {
    const p = listMemberPromotionProductSeeds().find((x) => x.id === id)!;
    expect(p.fallbackDescKo).toContain("1개");
    expect(p.fallbackDescKo).toContain("가장 최근 결제");
    expect(p.fallbackDescKo).toContain("‘포인트 노출’");
    expect(p.fallbackDescKo).not.toMatch(FORBIDDEN_KO);
    expect(p.fallbackDescEn).toMatch(/One top spot/);
    expect(p.fallbackDescEn).not.toMatch(FORBIDDEN_EN);
    expect(p.fallbackDescKo).toContain(`${p.durationDays}일간`);
  });

  it("거래 설명과 같은 뜻(위쪽 자리 1개 · 가장 최근 결제)", () => {
    const trade = listMemberPromotionProductSeeds().find((x) => x.id === "trade_promote_7")!;
    expect(trade.fallbackDescKo).toContain("1개(가장 최근 결제)");
    const community = listMemberPromotionProductSeeds().find((x) => x.id === "community_promote_7")!;
    expect(community.fallbackDescKo).toContain("1개(가장 최근 결제)");
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
