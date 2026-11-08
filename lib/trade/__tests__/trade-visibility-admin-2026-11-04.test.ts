import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRADE_LISTING_VISIBILITY_TOPIC,
  isTradePostPubliclyVisible,
  parseTradeListingVisibilityPayload,
} from "@/lib/trade/listing-visibility/listing-visibility-shared";
import { buildTradeChatListRowModel } from "@/lib/community-messenger/trade-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** 설계 docs/audit/trade-visibility-admin-full-design-2026-11-04.md (Owner 「설계안 승인」 2026-11-04) */
const src = (p: string) => readFileSync(p, "utf8");

describe("§1-3 노출 변경 방송 — 서버만 발행", () => {
  it("발행 지점: 관리자 노출 조치 2곳 · 신고 숨김 · 판매자 숨김/다시 보이기 · 판매자 삭제", () => {
    expect(src("app/api/admin/trade/posts/[id]/moderation/route.ts")).toContain("publishTradeListingVisibilityForModeration(id,");
    expect(src("app/api/admin/posts/[postId]/status/route.ts")).toContain("publishTradeListingVisibilityForModeration(postId,");
    expect(src("lib/admin/trade-admin/trade-report-decision.ts")).toContain('publishTradeListingVisibility(postId, false, "admin_hidden")');
    expect(src("app/api/posts/[postId]/owner-status/route.ts")).toContain('nextStatus === "hidden" ? "owner_hidden" : "restored"');
    expect(src("app/api/posts/[postId]/owner-delete/route.ts")).toContain('publishTradeListingVisibility(id, false, "owner_deleted")');
  });

  it("클라이언트는 발행하지 않는다(구독만) · 서버 모듈은 server-only", () => {
    const client = src("lib/trade/listing-visibility/listing-visibility-client.ts");
    expect(client).not.toMatch(/\.send\(|publish/i);
    expect(src("lib/trade/listing-visibility/listing-visibility-server.ts")).toContain('import "server-only"');
  });

  it("방송 내용 검사 — 모양이 다르면 버린다", () => {
    expect(parseTradeListingVisibilityPayload({ v: 1, postId: "p1", visible: false, reason: "admin_deleted" })).toEqual({
      v: 1,
      postId: "p1",
      visible: false,
      reason: "admin_deleted",
    });
    expect(parseTradeListingVisibilityPayload({ v: 2, postId: "p1", visible: false, reason: "admin_deleted" })).toBeNull();
    expect(parseTradeListingVisibilityPayload({ v: 1, postId: "", visible: false, reason: "admin_deleted" })).toBeNull();
    expect(parseTradeListingVisibilityPayload(null)).toBeNull();
  });

  it("DB 토픽 권한 = 로그인 회원 (마이그레이션이 같은 토픽 이름을 쓴다)", () => {
    const sql = src("supabase/migrations/20271104160000_trade_promotion_listing_sync_v2.sql");
    expect(sql).toContain(`when p_topic = ''${TRADE_LISTING_VISIBILITY_TOPIC}'' then`);
    expect(sql).toContain("auth.uid() is not null");
    expect(sql).toContain("anchor not found exactly once");
  });
});

describe("§1-3 받는 곳", () => {
  it("홈·카테고리 목록: 방송 받으면 카드 제거 · 복귀마다 재확인(30초 간격과 별개)", () => {
    const home = src("components/home/HomeProductList.tsx");
    expect(home).toContain('useTradeListingVisibilityRemoval((postId) => handleMenuAction(postId, "delete_own"))');
    expect(home).toMatch(/MIN_SILENT_REFRESH_GAP_MS\) \{\s*\/\*\*[^*]*\*\/\s*void reconcileVisibleRowsWithServer\(\);\s*return;/);
    const cat = src("components/post/PostListByCategory.tsx");
    expect(cat).toContain('useTradeListingVisibilityRemoval((postId) => handleMenuAction(postId, "delete_own"))');
    expect(cat).toContain("useRefetchOnPageShowRestore(reconcileOnReturn");
  });

  it("기기 목록 캐시(메모리·세션·로컬 24시간)·카테고리 캐시에서도 뺀다", () => {
    const client = src("lib/trade/listing-visibility/listing-visibility-client.ts");
    expect(client).toContain("if (!p.visible) dropPostFromHomePostsCache(p.postId)");
    const cache = src("lib/posts/getPostsForHome.ts");
    expect(cache).toContain("export function dropPostFromHomePostsCache");
    expect(cache).toContain("dropPostFromTradeFeedClientCache(id)");
  });

  it("카드·상세·채팅 카드: 방송·상태로 「볼 수 없는 글」", () => {
    expect(src("components/post/PostCard.tsx")).toContain('removedByBroadcast ? "hidden"');
    const detail = src("app/(main)/post/[id]/PostDetailPageClient.tsx");
    expect(detail).toContain("return <TradePostUnavailable />");
    expect(detail).toContain("res.status === 404");
    expect(detail).toContain("openedVisibleRef.current");
    const chat = src("components/chats/ChatProductSummary.tsx");
    expect(chat).toContain("isTradePostPubliclyVisible({ status: productStatusOverride ?? product.status })");
    expect(chat).toContain('t("trade_unavailable_title")');
  });
});

describe("D-4 공개 자격 판정 1곳", () => {
  it("숨김·삭제·관리자/판매자 조치 = 볼 수 없음", () => {
    expect(isTradePostPubliclyVisible({ status: "active" })).toBe(true);
    expect(isTradePostPubliclyVisible({ status: "sold" })).toBe(true);
    expect(isTradePostPubliclyVisible({ status: "hidden" })).toBe(false);
    expect(isTradePostPubliclyVisible({ status: "deleted" })).toBe(false);
    expect(isTradePostPubliclyVisible({ status: "active", moderation_state: "admin_hidden" })).toBe(false);
    expect(isTradePostPubliclyVisible({ status: "active", owner_state: "owner_hidden" })).toBe(false);
    expect(isTradePostPubliclyVisible({ status: "active", is_deleted: true })).toBe(false);
  });

  it("거래 채팅 목록 행: 구매자에게는 제목·가격·사진 대신 「볼 수 없는 글이에요」, 판매자 본인은 그대로", () => {
    const t = ((k: string) => k) as Parameters<typeof buildTradeChatListRowModel>[1];
    const room = {
      id: "r1",
      title: "상대",
      contextMeta: {
        v: 1,
        kind: "trade",
        postId: "p1",
        headline: "아이폰",
        priceLabel: "₱1,000",
        thumbnailUrl: "https://example.com/a.jpg",
        itemStateLabel: "삭제됨",
        sellerId: "seller-1",
      },
    } as unknown as CommunityMessengerRoomSummary;
    const buyer = buildTradeChatListRowModel(room, t, "buyer-1");
    expect(buyer.productUnavailable).toBe(true);
    expect(buyer.productTitle).toBe("trade_unavailable_title");
    expect(buyer.productPriceText).toBeNull();
    expect(buyer.productThumbnailUrl).toBeNull();
    const seller = buildTradeChatListRowModel(room, t, "seller-1");
    expect(seller.productUnavailable).toBe(false);
    expect(seller.productTitle).toBe("아이폰");
  });
});

describe("D-1·D-2·D-3·D-5·D-6·D-7", () => {
  it("D-1 내 매물: 관리자 삭제 글 제외 · 관리자 숨김 = 안내 배지 + 「문의하기」만", () => {
    expect(src("lib/my/load-my-posts-server.ts").match(/\.neq\("moderation_state", "admin_deleted"\)/g)?.length).toBe(2);
    expect(src("components/mypage/products/MyProductCard.tsx")).toContain("mypage_comp_product_status_admin_hidden");
    const actions = src("components/mypage/products/MyProductActions.tsx");
    expect(actions).toContain('items.push({ key: "inquiry", label: t("support_enter_cta")');
  });

  it("D-2 판매자 본인 상세: 관리자 조치 안내 · 시트는 「문의하기」만", () => {
    const view = src("components/post/PostDetailView.tsx");
    expect(view).toContain("isOwnPost && isAdminModeratedTradePost(ownerMenuPost)");
    expect(view).toContain("supportOnly={isAdminModeratedTradePost(ownerMenuPost)}");
    expect(src("lib/posts/load-post-detail-shared.ts")).toContain("withModerationStateForHiddenRow");
  });

  it("D-3 찜: 관리자 삭제 글은 목록·페이지·개수 3곳 모두에서 뺀다", () => {
    const fav = src("lib/favorites/load-favorite-posts-server.ts");
    expect(fav.match(/await loadAdminDeletedPostIds\(sb,/g)?.length).toBe(3);
  });

  it("D-5 처리된 신고: 처리 버튼 대신 결과·글 관리 링크", () => {
    const page = src("components/admin/reports/AdminReportDetailPage.tsx");
    expect(page).toContain('report.status === "pending" || report.status === "reviewing" ? (');
    expect(page).toContain("admin_report_processed_post_manage");
  });

  it("D-6 삭제 글 안내 · 같은 조치 반복 = 「이미 {상태}」", () => {
    expect(src("lib/admin/trade-admin/trade-post-tabs.ts")).toContain('undelete: "admin_trade_post_action_undelete"');
    expect(src("lib/i18n/catalog/copy-admin-l25-lib.ts")).toContain('admin_trade_post_action_undelete: "삭제 취소 → 숨김 상태로"');
    expect(src("app/api/admin/trade/posts/[id]/moderation/route.ts")).toContain("already_${state}");
    expect(src("components/admin/trade/kit/TradeAdminKit.tsx")).toContain('already_admin_deleted: "admin_trade_err_already_admin_deleted"');
    expect(src("lib/i18n/catalog/copy-admin-b4-community.ts")).toContain('admin_trade_err_already_admin_deleted: "이미 관리자 삭제 상태입니다."');
  });

  it("D-7 관리자 삭제 확인창: 진행 중 상위노출이 있을 때만 종료·환급 없음 안내", () => {
    const page = src("components/admin/trade/posts/TradePostDetailPage.tsx");
    expect(page).toContain('sheet.action === "delete" && promotionRunning');
    expect(page).toContain("isTradeBoostOrderOngoing");
  });
});

describe("DB B-2·B-3·B-7 (마이그레이션 계약)", () => {
  const sql = src("supabase/migrations/20271104160000_trade_promotion_listing_sync_v2.sql");
  it("판정 1곳을 동기화·재개·승인이 같이 쓴다", () => {
    expect(sql.match(/from public\.trade_promotion_listing_verdict\(/g)?.length).toBe(3);
  });
  it("B-2 종료일 당김 + 1회 정정 (시작일보다 앞서지 않게)", () => {
    expect(sql).toContain("end_at = greatest(start_at, least(end_at, now()))");
    expect(sql).toContain("set end_at = greatest(start_at, least(end_at, ended_at))");
  });
  it("B-7 심사 중: 판매완료·삭제 = 보류 해제 + 취소 · 승인 거절 listing_unavailable · 반려와 해제 함수 공유", () => {
    expect(sql).toContain("order_status in ('active', 'paused', 'pending_review')");
    expect(sql).toContain("'error', 'listing_unavailable'");
    expect(sql.match(/:= public\.trade_promotion_release_hold\(/g)?.length).toBe(2);
  });
  it("B-3 재개: 숨김 = 글 숨김 대기(waiting listing) · 관리자 화면 안내", () => {
    expect(sql).toContain("'waiting', 'listing'");
    expect(src("components/admin/trade/promotions/TradePromotionsPage.tsx")).toContain('json.waiting === "listing"');
  });
});
