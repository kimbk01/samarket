import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyMyBoostOrderTab, myBoostOrderStatusKey } from "@/lib/ads/my-ad-tab";
import { tradeBoostListingNoteKey } from "@/lib/promotion/trade-boost-listing-notice";

/** 거래 상위노출 ↔ 글 상태 연동 (설계 docs/audit/trade-promotion-listing-lifecycle-design-2026-11-03.md) */
const SQL = readFileSync("supabase/migrations/20271104130000_trade_promotion_listing_sync.sql", "utf8");
const read = (f: string) => readFileSync(f, "utf8");

describe("DB — 글 상태에 맞춰 주문 종료·일시정지·재개", () => {
  it("판매완료·판매자 삭제·관리자 삭제(완전 삭제 포함) = 종료 · 회원 귀책 · 환급 0", () => {
    expect(SQL).toContain("when v_post.moderation_state = 'admin_deleted' then 'listing_admin_deleted'");
    expect(SQL).toContain("when v_post.owner_state = 'owner_deleted' or coalesce(v_post.is_deleted, false) then 'listing_owner_deleted'");
    expect(SQL).toContain("when v_post.seller_listing_state = 'completed' or v_post.status = 'sold' then 'listing_sold'");
    expect(SQL).toContain("end_reason_code = v_terminal, fault = 'member', refund_points = 0");
    expect(SQL).toContain("after update or delete on public.posts");
  });

  it("숨김 = 일시정지(listing_*) · 다시 노출 = listing 일시정지만 재개 + 멈춘 시간만큼 연장", () => {
    expect(SQL).toContain("when v_post.moderation_state = 'admin_hidden' then 'listing_admin_hidden'");
    expect(SQL).toContain("when v_post.owner_state = 'owner_hidden' then 'listing_owner_hidden'");
    expect(SQL).toContain("elsif v_row.order_status = 'paused' and v_row.paused_by like 'listing_%' then");
    expect(SQL).toContain("end_at = end_at + make_interval(secs => v_gap)");
  });

  it("예약중은 상위노출 대상이라 처리하지 않는다", () => {
    expect(SQL).not.toMatch(/seller_listing_state = 'reserved'/);
  });

  it("관리자 일시정지 = admin · 관리자 재개는 글 상태 일시정지를 재개하지 않는다", () => {
    expect(SQL).toContain("set order_status = 'paused', paused_at = now(), paused_by = 'admin'");
    expect(SQL).toContain("'error', 'listing_paused'");
    expect(SQL).toContain("check (paused_by is null or paused_by in ('admin', 'listing_owner_hidden', 'listing_admin_hidden'))");
  });

  it("처리마다 감사 기록 · 함수는 서비스롤만 · 1회 정리 포함", () => {
    expect(SQL.match(/perform public\.trade_promotion_audit\('system'/g)?.length).toBe(3);
    expect(SQL).toContain("revoke all on function public.trade_promotion_sync_listing(uuid, boolean) from public, anon, authenticated;");
    expect(SQL).toContain("perform public.trade_promotion_sync_listing(v_post::uuid, false);");
  });
});

describe("내 광고 상태 문구", () => {
  const now = Date.parse("2026-11-04T00:00:00Z");
  it("일시정지는 「종료」 탭이 아니다", () => {
    expect(classifyMyBoostOrderTab("paused", "2026-11-01T00:00:00Z", now)).toBe("active");
  });
  it("이유별 문구", () => {
    expect(myBoostOrderStatusKey({ orderStatus: "paused", pausedBy: "listing_owner_hidden" }, now)).toBe(
      "mypage_oa_ads_boost_status_paused_hidden"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "paused", pausedBy: "listing_admin_hidden" }, now)).toBe(
      "mypage_oa_ads_boost_status_paused_review"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "paused", pausedBy: "admin" }, now)).toBe("mypage_oa_ads_boost_status_paused");
    expect(myBoostOrderStatusKey({ orderStatus: "ended", endReasonCode: "listing_sold" }, now)).toBe(
      "mypage_oa_ads_boost_status_ended_sold"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "ended", endReasonCode: "listing_owner_deleted" }, now)).toBe(
      "mypage_oa_ads_boost_status_ended_deleted"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "ended", endReasonCode: "listing_admin_deleted" }, now)).toBe(
      "mypage_oa_ads_boost_status_ended_policy"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "active", endAt: "2026-11-10T00:00:00Z" }, now)).toBe(
      "mypage_oa_ads_boost_status_active"
    );
    expect(myBoostOrderStatusKey({ orderStatus: "expired" }, now)).toBe("mypage_oa_ads_boost_status_ended");
  });
  it("화면이 상태 문구 함수를 쓴다", () => {
    expect(read("app/(main)/mypage/ads/MyAdsPageClient.tsx")).toContain("{t(myBoostOrderStatusKey(o))}");
  });
});

describe("확인창 광고 안내 — 판매완료 4곳 · 삭제 3곳 · 숨김 1곳", () => {
  it("문구 키", () => {
    expect(tradeBoostListingNoteKey("sold")).toBe("trade_ad_listing_note_end");
    expect(tradeBoostListingNoteKey("delete")).toBe("trade_ad_listing_note_end");
    expect(tradeBoostListingNoteKey("hide")).toBe("trade_ad_listing_note_hide");
  });
  it.each([
    ["components/post/PostDetailView.tsx", 'withTradeBoostListingNote(t, post.id, "sold"'],
    ["components/mypage/products/MyProductActions.tsx", 'withTradeBoostListingNote(t, product.id, "sold"'],
    ["components/trade/TradeFlowBanner.tsx", 'withTradeBoostListingNote(t, room.productId ?? "", "sold"'],
    ["components/community-messenger/CommunityMessengerTradeProcessSection.tsx", 'withTradeBoostListingNote(t, postId, "sold"'],
    ["components/mypage/products/MyProductActions.tsx", 'withTradeBoostListingNote(t, product.id, "delete"'],
    ["components/post/PostDetailSellerMoreSheet.tsx", 'withTradeBoostListingNote(t, tradeBoostPostId, "delete"'],
    ["components/post/PostListMenuBottomSheet.tsx", 'withTradeBoostListingNote(t, tradeBoostPostId, "delete"'],
    ["components/mypage/products/MyProductActions.tsx", 'withTradeBoostListingNote(t, product.id, "hide")'],
  ])("%s", (file, needle) => {
    expect(read(file)).toContain(needle);
  });
  it("판매완료 확인창이 더 생기면 이 표에 넣는다", () => {
    const sites = [
      "components/post/PostDetailView.tsx",
      "components/mypage/products/MyProductActions.tsx",
      "components/trade/TradeFlowBanner.tsx",
      "components/community-messenger/CommunityMessengerTradeProcessSection.tsx",
    ];
    for (const f of sites) {
      const src = read(f);
      expect(src.split('title: t("popup_q_mark_sold")').length - 1, f).toBe(src.split('"sold", t("popup_note_sold_final")').length - 1);
    }
  });
});
