import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { patchHomeTradePostsInPlace } from "@/lib/trade/marketplace/home-list-freshness";
import { shouldShowTradeListSectionDivider } from "@/components/trade/TradeListSectionDivider";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";

/** 설계 docs/audit/trade-r3-fb-ff-cause-design-2026-11-04.md */
type Row = { id: string; status: string; list_section?: string };
const same = (a: Row, b: Row) => a.status === b.status;

describe("F-B 제자리 갱신은 구역 키를 바꾸지 않는다 (CUT H 순서 불변과 같은 규칙)", () => {
  const prev: Row[] = [
    { id: "e2e", status: "active", list_section: "" },
    { id: "bun", status: "active", list_section: "" },
    { id: "old-sold", status: "sold", list_section: "state:sold" },
  ];
  const incoming: Row[] = [
    { id: "bun", status: "active", list_section: "" },
    { id: "e2e", status: "sold", list_section: "state:sold" },
    { id: "old-sold", status: "sold", list_section: "state:sold" },
  ];

  it("판매완료로 바뀐 행 = 상태만 새 값 · 자리와 구역 키는 이전 값", () => {
    const next = patchHomeTradePostsInPlace(prev, incoming, same);
    expect(next.map((r) => r.id)).toEqual(["e2e", "bun", "old-sold"]);
    expect(next[0]).toEqual({ id: "e2e", status: "sold", list_section: "" });
  });

  it("판매중 글 사이에 「판매완료」 줄이 새로 생기지 않는다", () => {
    const next = patchHomeTradePostsInPlace(prev, incoming, same);
    const lines = next.filter((p, i) => shouldShowTradeListSectionDivider(next[i - 1]?.list_section, p.list_section, i));
    const before = prev.filter((p, i) => shouldShowTradeListSectionDivider(prev[i - 1]?.list_section, p.list_section, i));
    expect(lines.map((p) => p.id)).toEqual(before.map((p) => p.id));
  });
});

describe("F-F 상세 = 다시 나타날 때 판매 상태 갱신 · 광고 배지는 상위노출 대상일 때만", () => {
  it("상세 클라이언트가 붙을 때 refreshListingFields 1회", () => {
    const src = readFileSync("app/(main)/post/[id]/PostDetailPageClient.tsx", "utf8");
    /** 재감사 B-4: 나타날 때는 15초 캐시를 건너뛴다 */
    expect(src).toMatch(/if \(!id\) return;\n(?:\s*\/\*\*[\s\S]*?\*\/\n)?\s*void refreshListingFields\(\{ fresh: true \}\);\n\s*const onVis/);
  });

  it("배지 조건 = 광고 표시 && 상위노출 대상(판매완료·숨김 제외 · 예약중 유지)", () => {
    const src = readFileSync("components/post/PostDetailView.tsx", "utf8");
    expect(src).toContain(
      "postHasTradePromotionOverlay(post) && isPostEligibleForPromotionBoost(post.status, post.seller_listing_state)"
    );
    expect(isPostEligibleForPromotionBoost("sold", "completed")).toBe(false);
    expect(isPostEligibleForPromotionBoost("hidden", "inquiry")).toBe(false);
    expect(isPostEligibleForPromotionBoost("active", "inquiry")).toBe(true);
    expect(isPostEligibleForPromotionBoost("reserved", "reserved")).toBe(true);
  });
});
