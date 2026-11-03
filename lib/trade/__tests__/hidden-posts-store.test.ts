import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hideTradePost, unhideTradePost } from "@/lib/trade/hidden-posts-store";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("F1 — 거래 글 숨김 저장소 (화면 공통)", () => {
  it("숨김·되돌리기는 같은 id 를 여러 번 불러도 안전하다", () => {
    expect(() => {
      hideTradePost("p1");
      hideTradePost("p1");
      unhideTradePost("p1");
      unhideTradePost("p1");
      hideTradePost("  ");
    }).not.toThrow();
  });

  it("PostCard 가 숨기기·신고를 직접 처리하고 자리 카드도 직접 그린다", () => {
    const card = src("components/post/PostCard.tsx");
    expect(card).toContain("useIsTradePostHidden(post.id)");
    expect(card).toContain("useReportedPostIds().has(post.id)");
    expect(card).toMatch(/action === "hide"[\s\S]*hideTradePost\(post\.id\)/);
    expect(card).toMatch(/action === "report"[\s\S]*setReportOpen\(true\)/);
    /** Owner 2026-11-04: 신고한 글은 빈 칸 카드가 아니라 같은 카드를 판매완료처럼 흐리게(사선 + 「신고한 글입니다」) */
    expect(card).not.toContain("ReportedPostCard");
    expect(card).toContain('const isSoldOrClosed = statusLower === "sold" || isUnavailable || isReported;');
    expect(card).toContain("<HiddenPostCard");
  });

  it("목록·찜 화면은 숨김·신고 상태를 따로 들고 있지 않다(중복 제거)", () => {
    for (const rel of [
      "components/home/HomeProductList.tsx",
      "components/post/PostListByCategory.tsx",
      "components/favorites/FavoriteProductsView.tsx",
    ]) {
      const s = src(rel);
      expect(s, rel).not.toContain("hiddenPostIds");
      expect(s, rel).not.toContain("reportPostId");
      expect(s, rel).not.toContain("ReportedPostCard");
      expect(s, rel).not.toContain("HiddenPostCard");
    }
  });

  it("F5: 쓰지 않는 「관심 없음」 카드와 메뉴 키가 없다", () => {
    const wording = src("lib/i18n/catalog/popup-ssot-wording.ts");
    expect(wording).not.toMatch(/popup_menu_(interest|not_interest|exposure_criteria)/);
    expect(() => src("components/post/NotInterestedCard.tsx")).toThrow();
  });
});
