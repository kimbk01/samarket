import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildShareUrl } from "@/lib/share/share-url";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("CUT G — DETAIL share (통합 공유 · Owner 2026-11-14 「CUT G 열고 통합」)", () => {
  it("상세 공유 = 통합 공유 실행 훅 + 운영 /post/[id] (window.location·자동 복사 없음)", () => {
    const src = readRepoFile("components/post/PostDetailView.tsx");
    expect(src).toContain("useDibayShareSheet");
    expect(src).toContain('buildShareUrl({ kind: "market", postId: post.id })');
    expect(src).not.toContain("shareOrCopyTradeListing");
    expect(src).not.toContain("navigator.share");
    expect(buildShareUrl({ kind: "market", postId: "abc-1" })).toMatch(/^https:\/\/[^/]+\/post\/abc-1$/);
  });
});

describe("CUT G — favorite count CASE B (no column writer)", () => {
  it("toggle route does not UPDATE posts.favorite_count", () => {
    const src = readRepoFile("app/api/favorites/toggle/route.ts");
    expect(src).toContain("countFavoritesForPostId");
    expect(src).toMatch(/favoriteCount/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/favorite_count\s*:/);
    /** 거래 H F-3: 글 공개 자격 확인은 실테이블 읽기(select)만 — 쓰기 없음 */
    expect(src).not.toMatch(/\.from\(POSTS_TABLE_WRITE\)\s*\.(update|insert|upsert|delete)\(/);
  });

  it("live COUNT helper reads favorites, not the snapshot column", () => {
    const src = readRepoFile("lib/posts/post-favorite-count-server.ts");
    expect(src).toContain('from("favorites")');
    expect(src).toContain('eq("post_id"');
    expect(src).not.toMatch(/\.update\s*\(/);
  });
});

describe("P-3 — favorite count display (trigger-backed posts.favorite_count)", () => {
  it("LIST preview renders 관심 N from posts.favorite_count (trade/uc only)", () => {
    const src = readRepoFile("lib/posts/post-list-preview-model.ts");
    expect(src).toContain("post_preview_fav_count");
    expect(src).toContain("post.favorite_count");
    expect(src).toContain("tr_favorites_sync_count");
  });

  it("GRID PostCard renders 관심 N next to the location", () => {
    const src = readRepoFile("components/post/PostCard.tsx");
    expect(src).toContain('data-ui4-slot="favorite-count"');
    expect(src).toContain("post.favorite_count");
  });

  it("SEARCH ProductCard does not render likesCount", () => {
    const src = readRepoFile("components/product/ProductCard.tsx");
    expect(src).not.toContain("likesCount");
    expect(src).not.toContain("ui_product_interest_count");
  });

  it("DETAIL renders 관심 N and refreshes it from the toggle response", () => {
    const src = readRepoFile("components/post/PostDetailView.tsx");
    expect(src).toContain("tradeDetailFavoritesLine");
    expect(src).toContain("setFavoriteTotal(res.favoriteCount)");
  });

  it("popular sort keeps the list contract order (view_count → created_at), not favorite_count", () => {
    const src = readRepoFile("lib/posts/trade-posts-range-query.ts");
    expect(src).not.toContain('order("favorite_count"');
    expect(src).toMatch(/order\("view_count", \{ ascending: false \}\)\.order\("created_at"/);
  });
});

describe("CUT G — favorite / report / share surfaces", () => {
  it("FavoriteContext uses toggleFavorite + POST_FAVORITE_CHANGED_EVENT", () => {
    const src = readRepoFile("contexts/FavoriteContext.tsx");
    expect(src).toContain('from "@/lib/favorites/toggleFavorite"');
    expect(src).toContain("POST_FAVORITE_CHANGED_EVENT");
    expect(src).not.toContain("toggleFavoritePost");
  });

  it("SEARCH ProductCard still uses FavoriteToggleButton (context → toggleFavorite)", () => {
    const src = readRepoFile("components/product/ProductCard.tsx");
    expect(src).toContain("FavoriteToggleButton");
    expect(src).not.toContain("ReportReasonModal");
  });

  it("FavoritesHubView invalidation stays on POST_FAVORITE_CHANGED_EVENT", () => {
    const src = readRepoFile("components/favorites/FavoriteProductsView.tsx");
    expect(src).toContain("POST_FAVORITE_CHANGED_EVENT");
  });

  it("DETAIL uses ReportReasonModal and the unified share hook", () => {
    const src = readRepoFile("components/post/PostDetailView.tsx");
    expect(src).toContain("ReportReasonModal");
    expect(src).toContain("useDibayShareSheet");
    expect(src).not.toContain("createReport");
    expect(src).not.toContain("ui_report_reason_title");
  });

  it("reports route keeps existing writer and does not add precheck 409 dedup", () => {
    const src = readRepoFile("app/api/reports/route.ts");
    expect(src).toContain('.from("reports")');
    expect(src).toContain(".insert");
    expect(src).not.toMatch(/status:\s*409/);
  });
});

describe("CUT G — report contract", () => {
  /**
   * F1 (Owner 2026-11-03 「F1·F5 구현」): 목록 신고는 카드(PostCard)가 직접 연다 — 홈·카테고리·찜·최근 본·전역 검색 같은 동작.
   * 목록 컴포넌트는 신고 창을 따로 두지 않는다(중복 제거). SEARCH 가로 카드(ProductCard)는 그대로 신고 입구 없음.
   */
  it("LIST card and DETAIL use ReportReasonModal; list containers and SEARCH have no own report entry", () => {
    const card = readRepoFile("components/post/PostCard.tsx");
    const list = readRepoFile("components/home/HomeProductList.tsx");
    const category = readRepoFile("components/post/PostListByCategory.tsx");
    const detail = readRepoFile("components/post/PostDetailView.tsx");
    const searchCard = readRepoFile("components/product/ProductCard.tsx");
    const myFav = readRepoFile("components/favorites/FavoritePostCard.tsx");
    expect(card).toContain("ReportReasonModal");
    expect(card).toContain("hideTradePost");
    expect(list).not.toContain("ReportReasonModal");
    expect(category).not.toContain("ReportReasonModal");
    expect(detail).toContain("ReportReasonModal");
    expect(searchCard).not.toContain("ReportReasonModal");
    expect(myFav).not.toContain("ReportReasonModal");
  });
});
