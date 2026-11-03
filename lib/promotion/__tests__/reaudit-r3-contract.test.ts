/**
 * 재감사 R3 — 계획 누락 마무리 (Owner 「R3 진행」 2026-11-03).
 * I-3 이유 문구 · I-5 오류 문구 · I-7 게시본 더 보기 · B-3 예비 배너 · B-4 첫 방문 · B-6 위치 · A-3/A-4/A-5 · P-3 옵션 · P-6 · G-8.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  postMatchesCompositionFilterClauses,
  type CompositionFilterClause,
} from "@/lib/trade/category-form/composition-filter-query";
import { projectTradeFeedWithPromotions } from "@/lib/promotion/feed-promotion-projection";
import { readNonAdOpenOverlayCount, registerOpenOverlay } from "@/lib/ui/open-overlay-registry";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("P-3 품목 옵션 — 끼우기 조건이 목록 조건과 같다", () => {
  const post = (meta: Record<string, unknown>) => ({ id: "x", meta }) as unknown as Record<string, unknown>;
  const eq: CompositionFilterClause = { fieldId: "brand", op: "eq", columns: ["meta->>brand", "meta->>brand_alt"], values: ["kia"] };
  const ex: CompositionFilterClause = { fieldId: "car_trade", op: "exclude_eq", columns: ["meta->>car_trade"], values: ["buy"] };
  const or: CompositionFilterClause = {
    fieldId: "job",
    op: "or_eq",
    columns: ["meta->>listing_kind", "meta->>job_type"],
    values: ["work", "seek"],
  };
  const like: CompositionFilterClause = { fieldId: "model", op: "ilike", columns: ["meta->>model"], values: ["Sport"] };

  it("eq: 어느 컬럼이든 같으면 맞음, 값이 없으면 안 맞음(SQL NULL)", () => {
    expect(postMatchesCompositionFilterClauses(post({ brand_alt: "kia" }), [eq])).toBe(true);
    expect(postMatchesCompositionFilterClauses(post({ brand: "bmw" }), [eq])).toBe(false);
    expect(postMatchesCompositionFilterClauses(post({}), [eq])).toBe(false);
  });
  it("exclude_eq: 값이 없거나 다르면 맞음", () => {
    expect(postMatchesCompositionFilterClauses(post({}), [ex])).toBe(true);
    expect(postMatchesCompositionFilterClauses(post({ car_trade: "sell" }), [ex])).toBe(true);
    expect(postMatchesCompositionFilterClauses(post({ car_trade: "buy" }), [ex])).toBe(false);
  });
  it("or_eq · ilike · 모든 조건 AND", () => {
    expect(postMatchesCompositionFilterClauses(post({ job_type: "seek" }), [or])).toBe(true);
    expect(postMatchesCompositionFilterClauses(post({ job_type: "hire" }), [or])).toBe(false);
    expect(postMatchesCompositionFilterClauses(post({ model: "Sportage" }), [like])).toBe(true);
    expect(postMatchesCompositionFilterClauses(post({ model: "Sportage", car_trade: "buy" }), [like, ex])).toBe(false);
    expect(postMatchesCompositionFilterClauses(post({}), [])).toBe(true);
  });

  it("옵션이 안 맞는 상위노출 글은 위쪽에 끼우지 않는다", () => {
    const mk = (id: string, meta?: Record<string, unknown>) => ({ id, status: "active", title: id, meta }) as PostWithMeta;
    const { promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a")],
      promotedPosts: [mk("p1", { brand: "bmw" }), mk("p2", { brand: "kia" })],
      activePromotionIds: new Set(["p1", "p2"]),
      pinFilter: { compositionFilters: [eq] },
    });
    expect(promotedIdsOnPage).toEqual(["p2"]);
  });

  it("두 목록 경로가 같은 옵션 조건을 넘긴다", () => {
    expect(read("lib/posts/home-posts-route-core.ts")).toMatch(/pinFilter: \{[\s\S]*?compositionFilters,\n\s*\},/);
    expect(read("lib/posts/resolve-trade-feed-open-payload.ts")).toContain("compositionFilters: opts.compositionFilters ?? null");
  });
});

describe("G-8 — 자체 시트·대화상자도 열려 있으면 팝업을 미룬다", () => {
  it("등록하면 수가 늘고, 닫으면 줄고, 광고 자신은 세지 않는다", () => {
    const base = readNonAdOpenOverlayCount();
    const release = registerOpenOverlay({ ad: false });
    const releaseAd = registerOpenOverlay({ ad: true });
    expect(readNonAdOpenOverlayCount()).toBe(base + 1);
    release();
    releaseAd();
    expect(readNonAdOpenOverlayCount()).toBe(base);
  });

  it("조사된 자체 창 26곳이 열림 상태로 등록한다(통화 화면 제외)", () => {
    const files = [
      "components/community-messenger/MessengerSheetUi.tsx",
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx",
      "components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet.tsx",
      "components/community-messenger/room/phase2/TradePostDetailSlidePanel.tsx",
      "components/community-messenger/room/MessengerImageLightbox.tsx",
      "components/community-messenger/room/MessengerPhotoSelectSaveSheet.tsx",
      "components/community-messenger/room/message/MessageReactionRosterSheet.tsx",
      "components/community-messenger/meetings/MeetingJoinPreviewFullScreen.tsx",
      "components/common/media/PostImageViewer.tsx",
      "components/chats/StoreOrderSellerOrderPanel.tsx",
      "components/chats/StoreOrderBuyerChatTop.tsx",
      "components/business/owner/OwnerStoreOrderChatSlidePanel.tsx",
      "components/mypage/BuyerStoreOrderChatSlidePanel.tsx",
      "components/mypage/BuyerStoreOrderReviewSlidePanel.tsx",
      "components/stores/store-detail/StoreReviewsSlidePanel.tsx",
      "components/stores/commission/StoreCommissionLedgerTable.tsx",
      "components/stores/browse/StoreListFilterChips.tsx",
      "components/stores/home/hub/StoresHomeSearchModal.tsx",
      "components/philife/PhilifeHeaderNotificationInbox.tsx",
      "components/trade/TradeWriteBottomSheet.tsx",
      "components/trade/TradeWriteSheetLoadingFrame.tsx",
      "components/philife/PhilifeWriteBottomSheet.tsx",
      "components/trade/TradeHistoryFromHeaderStack.tsx",
      "components/philife/PhilifeMessengerFromHeaderStack.tsx",
      "components/business/owner/OwnerStorePreviewModal.tsx",
      "components/business/owner/OwnerMobileOpsMenuDrawer.tsx",
    ];
    for (const f of files) expect(read(f), f).toMatch(/useRegisterOpenOverlay\(/);
    // 항상 마운트된 서랍은 마운트가 아니라 열림 상태로 센다
    expect(read("components/chats/StoreOrderBuyerChatTop.tsx")).toContain("useRegisterOpenOverlay(drawerOpen)");
    expect(read("components/business/owner/OwnerMobileOpsMenuDrawer.tsx")).toContain("useRegisterOpenOverlay(open && mounted)");
  });
});

describe("인트로 I-3 · I-5 · I-7", () => {
  const page = read("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
  it("I-5: 서버·업로드 오류 코드가 모두 한국어 문구로 연결된다", () => {
    for (const code of [
      "layout_logo_requires_logo",
      "decoration_asset_missing",
      "background_invalid",
      "schedule_already_ended",
      "extension_mismatch",
      "empty",
      "upload_missing",
      "supabase_unconfigured",
    ]) {
      expect(page, code).toMatch(new RegExp(`\\b${code}: "admin_launch_intro_err_`));
    }
    expect(page).toContain("/^storage_\\d+$/.test(code)");
  });
  it("I-3: 5초를 넘어 막힌 재게시·재개 버튼 옆에 이유를 보여 준다", () => {
    expect(page).toContain('data-launch-intro-too-long-reason="reactivate"');
    expect(page).toContain('data-launch-intro-too-long-reason="resume"');
  });
  it("I-7: 게시본 목록은 20건씩 더 보기, 저장·게시 응답도 보던 건수 유지", async () => {
    const snap = read("lib/launch-intro/admin-snapshot.ts");
    expect(snap).toContain("publicationsTotal: pubsRes.total");
    for (const r of ["route.ts", "state/route.ts", "publish/route.ts"]) {
      expect(read(`app/api/admin/launch-intro/${r}`), r).toContain("launchIntroPublicationsLimitFromUrl(req.url)");
    }
    expect(page).toContain("withPublicationsLimit(url, publicationsLimitRef.current)");
  });
});

describe("배너 B-3 · B-4 · B-6", () => {
  it("B-3: 업종 상단은 예비 배너까지 받아 이미지 오류 때 다음 배너로 넘어간다", () => {
    expect(read("app/api/stores/browse-top-banners/route.ts")).toContain("capacity: STAGE2_BROWSE_BANNER_FALLBACK_POOL");
    expect(read("components/stores/browse/StoresBrowseTopBanner.tsx")).toContain("prev.filter((b) => b.id !== failedId)");
  });
  it("B-4: 배달 홈 상단 배너 수를 기기에 남겨 앱 첫 방문에도 빈 상자를 그리지 않는다", () => {
    const hero = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(hero).toContain("writeStoredHeroBannerCount(visible.length)");
    expect(hero).toContain("(lastKnownHeroBannerCount ?? storedCount) === 0");
  });
  it("B-6: 마이페이지 배너 어드민에 쓰지 않는 위치가 남지 않는다", () => {
    expect(read("lib/types/admin-banner.ts")).toContain('export type BannerPlacement = "mypage_top";');
    expect(read("components/admin/banners/AdminBannerFilterBar.tsx")).not.toContain("placement");
  });
});

describe("어드민 문구 A-3 · A-4 · A-5 · P-6", () => {
  it("A-3: 한국어 가격 원본 안내에 테이블 이름이 없다", () => {
    const model = read("lib/admin/ads-commercial/products-control-model.ts");
    expect(model).not.toMatch(/priceAuthorityKo: "[^"]*(member_promotion_products|delivery_ad_packages|feed_ad_products)/);
  });
  it("A-4·A-5: 「Community」 대신 「커뮤니티」, 지면 이름은 한 곳", () => {
    expect(read("lib/admin/ads-control-plane/project-family-rows.ts")).not.toContain('"Community 상위노출"');
    // 한국어 문구(ko ? "…") 쪽에만 영문이 없으면 된다 — 영어 화면 문구는 그대로
    expect(read("components/admin/ads/AdminAdvertisingWorkspace.tsx")).not.toMatch(/\? "[^"]*Community\/Trade/);
    const inv = read("lib/admin/ads-exposure/placement-inventory.ts");
    expect(inv).not.toContain("const FEED_TITLES");
    expect(inv).toContain("humanPlacementLabel(key, true)");
  });
  it("P-6: 거래 어드민은 「홍보」 대신 「상위노출」", () => {
    const page = read("components/admin/trade/promotions/TradePromotionsPage.tsx");
    expect(page).toContain('title="거래 상위노출"');
    expect(page).not.toMatch(/"[^"]*홍보[^"]*"/);
  });
});

describe("E-15 — 일시정지 주문 중복 결제 막기 (DB)", () => {
  it("일시정지 주문은 종료일과 관계없이 진행 중으로 본다 (거래·커뮤니티)", () => {
    const mig = read("supabase/migrations/20271104000000_promotion_paused_dup_guard.sql");
    expect(mig).toContain("AND (order_status = 'paused' OR end_at >= now())");
    expect(mig).toContain("AND (order_status IN ('pending_review', 'paused') OR end_at >= now())");
    expect(mig).toContain("DROP FUNCTION public._ads_e15_replace_once");
  });
});
