/**
 * Owner 2026-10-28: 샘플 = 실제 거래 글과 같은 카드(PostCard) · 영문 지역 줄 · 페소 표기 · 주제당 10건.
 * 숨김·삭제 글은 404 대신 「볼 수 없는 글」.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { resolveTradeCardCityAreaLine } from "@/lib/posts/post-listing-location-label";
import { TRADE_SHOWCASE_LISTINGS } from "@/lib/trade/showcase/trade-showcase-listings";
import { tradeShowcaseItemToPost } from "@/lib/trade/showcase/trade-showcase-post";
import type { TradeShowcaseItem } from "@/lib/trade/showcase/trade-showcase-model";

const item = (sort_order: number, over: Partial<TradeShowcaseItem> = {}): TradeShowcaseItem => ({
  id: "s1",
  trade_category_id: "fa4af727-ec64-466e-b164-42368b839daf",
  title: "페소 팝니다 · 원화로 받아요 (Poblacion)",
  price: 20000,
  price_note: null,
  region_label: null,
  description: null,
  image_urls: ["https://images.unsplash.com/photo-x"],
  sort_order,
  is_active: true,
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:00:00Z",
  ...over,
});

describe("샘플 = 실제 글 모양", () => {
  it("주제 6개 × 10건 = 60 (sort_order 200~295, 끝자리 = 주제)", () => {
    const keys = Object.keys(TRADE_SHOWCASE_LISTINGS).map(Number);
    expect(keys).toHaveLength(60);
    for (let t = 0; t < 6; t += 1) expect(keys.filter((k) => k % 10 === t)).toHaveLength(10);
  });

  it("모든 샘플 지역 줄이 영문 「도시 › 동네」", () => {
    for (const l of Object.values(TRADE_SHOWCASE_LISTINGS)) {
      const line = resolveTradeCardCityAreaLine({ tradeLguId: l.trade_lgu_id, region: l.region, city: l.city });
      expect(line).toMatch(/^[A-Za-zñ .–-]+ City › [A-Za-zñ0-9 .–-]+$/);
    }
  });

  it("환전 샘플 가격 = 다른 카드와 같은 페소 표기(₱20,000, 띄어쓰기 없음)", () => {
    const post = tradeShowcaseItemToPost(item(203));
    const m = buildPostListPreviewModel(post as unknown as Record<string, unknown>, {
      currency: "PHP",
      locale: "ko",
      skinKey: "exchange",
      categorySlug: "current",
      fieldComposition: null,
    });
    expect(m?.feedPrice).toBe("₱20,000");
  });

  it("샘플 id 는 실제 글과 겹치지 않고, 상태는 판매중", () => {
    const post = tradeShowcaseItemToPost(item(203));
    expect(post.id.startsWith("showcase-")).toBe(true);
    expect(post.status).toBe("active");
  });

  it("목록 샘플 카드는 PostCard(showcase 모드)로 그린다", () => {
    const src = readFileSync("components/trade/TradeShowcaseSection.tsx", "utf8");
    expect(src).toContain("<PostCard");
    expect(src).toContain("showcase={{ onOpen");
  });
});

describe("볼 수 없는 글 — 404 대신", () => {
  it("상세: 글이 없거나 볼 수 없으면 TradePostUnavailable", () => {
    const src = readFileSync("app/(main)/post/[id]/page.tsx", "utf8");
    expect(src).toMatch(/if \(!bundle\) \{[\s\S]*?return <TradePostUnavailable \/>/);
  });
  it("카드: 남의 숨김·삭제 글은 눌러도 이동하지 않음(판매완료와 같은 비활성) + 「볼 수 없는 글」", () => {
    const src = readFileSync("components/post/PostCard.tsx", "utf8");
    expect(src).toContain("const isSoldOrClosed = statusLower === \"sold\" || isUnavailable;");
    expect(src).toContain("trade_card_status_unavailable");
  });
  it("찜 카드: 볼 수 없는 글은 채팅·판매자 버튼 없음", () => {
    const src = readFileSync("components/favorites/FavoritePostCard.tsx", "utf8");
    expect(src).toContain("footer={unavailable ? undefined");
  });
});
