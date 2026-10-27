"use client";

import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import type { MyProductStatusChange } from "@/components/mypage/products/MyProductActions";
import { Plus } from "lucide-react";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  collectActivePromotionTargetIds,
  filterMyProductsByListingAxis,
} from "@/lib/products/my-product-listing-filter";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import {
  fetchMypageListJson,
  forgetMypageListCache,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointPromotionOrder } from "@/lib/types/point";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import {
  SellerHubEmptyActionButton,
  SellerHubEmptyActionLink,
  SellerHubEmptyState,
} from "@/components/mypage/seller/SellerHubEmptyState";
import { fetchTradeHistorySalesBySession } from "@/lib/mypage/trade-history-client";
import { groupSalesRowsByPostId } from "@/lib/mypage/seller-listings-with-trades";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { MyProductCard } from "./MyProductCard";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

type MyProductsViewProps = {
  filter: MyProductFilterKey;
  onFilterChange: (value: MyProductFilterKey) => void;
  promotedOnly: boolean;
  onPromotedOnlyChange: (value: boolean) => void;
};

export function MyProductsView({
  filter,
  onFilterChange,
  promotedOnly,
  onPromotedOnlyChange,
}: MyProductsViewProps) {
  const { t, safeT } = useI18n();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const writeCtx = useWriteCategory();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getCurrentUser()?.id ?? null);
  const [promotedTargetIds, setPromotedTargetIds] = useState<Set<string>>(() => new Set());
  const [salesRows, setSalesRows] = useState<SalesHistoryRow[]>([]);
  const [salesLoadFailed, setSalesLoadFailed] = useState(false);

  const tradesByPostId = useMemo(() => groupSalesRowsByPostId(salesRows), [salesRows]);

  useEffect(() => {
    const syncUser = () => setCurrentUserId(getCurrentUser()?.id ?? null);
    syncUser();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
  }, []);

  /** A1 페이지 모드(옵트인) — 서버가 같은 술어(`filterMyProductsByListingAxis`)로 필터·keyset 커서 */
  const listKey = currentUserId
    ? `me:my-posts:${currentUserId.trim()}:${filter}:${promotedOnly ? 1 : 0}`
    : null;
  const fetchMyPostsPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<Product>> => {
      const qs = new URLSearchParams({ limit: String(MYPAGE_LIST_PAGE_DEFAULT), filter });
      if (promotedOnly) qs.set("promoted", "1");
      if (cursor) qs.set("cursor", cursor);
      const data = await runSingleFlight(`${listKey}:${cursor ?? ""}`, () =>
        fetchMypageListJson<{ posts?: Product[]; next_cursor?: string | null }>(`/api/my/posts?${qs}`)
      );
      return { items: (data.posts ?? []) as Product[], next_cursor: data.next_cursor ?? null };
    },
    [filter, listKey, promotedOnly]
  );
  const list = useMypageCursorList<Product>({
    cacheKey: listKey,
    fetchPage: fetchMyPostsPage,
    getId: (p) => String(p.id),
  });
  const { reload: reloadList, setItems: setListItems } = list;

  /** 낙관 갱신 후에도 현재 필터 술어를 그대로 적용(같은 술어 — 서버와 일치) */
  const products = filterMyProductsByListingAxis(list.items, filter, promotedOnly, promotedTargetIds);

  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  const fetchPromotedTargetIds = useCallback(async (uid: string) => {
    const res = await runSingleFlight(`me:promotion-orders:get:${uid.trim()}`, () =>
      fetch("/api/me/points/promotion-orders", { cache: "no-store", credentials: "include" })
    );
    if (!res.ok) return new Set<string>();
    const data = (await res.clone().json()) as { ok?: boolean; orders?: PointPromotionOrder[] };
    if (!data.ok || !Array.isArray(data.orders)) return new Set<string>();
    return collectActivePromotionTargetIds(data.orders);
  }, []);

  /** 보조 데이터(홍보 대상·판매 거래 행) — 본문 목록과 별개(부분 오류는 카드 단위 안내) */
  const loadListing = useCallback(
    async (uid: string) => {
      const [ids, salesResult] = await Promise.all([
        fetchPromotedTargetIds(uid).catch(() => new Set<string>()),
        fetchTradeHistorySalesBySession()
          .then((rows) => ({ ok: true as const, rows: rows as SalesHistoryRow[] }))
          .catch(() => ({ ok: false as const, rows: [] as SalesHistoryRow[] })),
      ]);
      return {
        ids,
        salesRows: salesResult.rows,
        salesOk: salesResult.ok,
      };
    },
    [fetchPromotedTargetIds]
  );

  const applyListing = useCallback(
    (r: { ids: Set<string>; salesRows: SalesHistoryRow[]; salesOk: boolean }) => {
      setPromotedTargetIds(r.ids);
      setSalesRows(r.salesRows);
      setSalesLoadFailed(!r.salesOk);
    },
    []
  );

  useEffect(() => {
    if (!currentUserId) {
      setPromotedTargetIds(new Set());
      setSalesRows([]);
      setSalesLoadFailed(false);
      return;
    }
    let cancelled = false;
    loadListing(currentUserId)
      .then((r) => {
        if (!cancelled) applyListing(r);
      })
      .catch(() => {
        if (!cancelled) setSalesLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyListing, currentUserId, loadListing]);

  /** 조용한 재조회 — 첫 페이지만 교체(이미 불러온 추가 페이지 유지) + 보조 데이터 */
  const refresh = useCallback(() => {
    if (!currentUserId) return;
    void reloadList();
    void loadListing(currentUserId)
      .then(applyListing)
      .catch(() => {
        setSalesLoadFailed(true);
      });
  }, [applyListing, currentUserId, loadListing, reloadList]);

  useEffect(() => {
    if (!currentUserId) return;
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [currentUserId, refresh]);

  useRefetchOnPageShowRestore(refresh, { enableVisibilityRefetch: false });

  /** 쓰기 후 — 다른 필터 캐시 무효화 + 홈 요약 무효화 + 현재 목록 재조회 */
  const afterWrite = useCallback(() => {
    if (currentUserId) forgetMypageListCache(`me:my-posts:${currentUserId.trim()}:`);
    invalidateMypageSummary();
    refresh();
  }, [currentUserId, refresh]);

  const handleStatusChange = useCallback(
    async (productId: string, newStatus: MyProductStatusChange) => {
      if (!currentUserId) return;
      /** P-1: 판매완료 ⇄ 판매중은 `listing`, 숨김·다시 보이기는 `status` (구매자 지정 없음) */
      const isListingToggle = newStatus === "sold" || newStatus === "selling";
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(productId)}/owner-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isListingToggle ? { listing: newStatus } : { status: newStatus }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !data.ok) {
          // 서버 원문(영문·한국어) 노출 금지 — i18n 오류 토스트
          showMypageToast(t("mypage_comp_product_network_change_failed"), "error");
          return;
        }
        if (isListingToggle) {
          const undo: MyProductStatusChange = newStatus === "sold" ? "selling" : "sold";
          showMypageToast(
            t(newStatus === "sold" ? "trade_listing_marked_sold_toast" : "trade_listing_marked_selling_toast"),
            "success",
            { action: { onPress: () => void handleStatusChangeRef.current(productId, undo) } }
          );
        }
        afterWrite();
      } catch {
        showMypageToast(t("mypage_comp_product_network_change_failed"), "error");
      }
    },
    [afterWrite, currentUserId, t]
  );

  /** 되돌리기 토스트가 최신 핸들러를 부르도록 */
  const handleStatusChangeRef = useRef(handleStatusChange);
  handleStatusChangeRef.current = handleStatusChange;

  const handleDelete = useCallback(
    async (productId: string) => {
      if (!currentUserId) return;
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(productId)}/owner-delete`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !data.ok) {
          showMypageToast(t("mypage_comp_product_network_change_failed"), "error");
          return;
        }
        setListItems((prev) => prev.filter((p) => String(p.id) !== productId));
        afterWrite();
      } catch {
        showMypageToast(t("mypage_comp_product_network_change_failed"), "error");
      }
    },
    [afterWrite, currentUserId, setListItems, t]
  );

  const openWrite = useCallback(() => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  }, [guardBeforeNavigate, openTradeWriteSheet, writeCtx]);

  /** 판매 등록 CTA 표기 SSOT — 「판매하기」 (TM-40) */
  const createLabel = t("trade_write_sell_cta");

  const renderEmpty = () => {
    const viewAllLabel = safeT("marketplace_seller_cta_view_all_listings", {
      fallbackKo: "전체 매물 보기",
      fallbackEn: "View all listings",
    });
    const clearPromoLabel = safeT("marketplace_seller_cta_clear_promoted_only", {
      fallbackKo: "포인트 홍보 해제",
      fallbackEn: "Clear Point filter",
    });

    if (filter === "all" && !promotedOnly) {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_all", {
            fallbackKo: "등록한 매물이 없어요",
            fallbackEn: "No listings yet",
          })}
          actions={
            <SellerHubEmptyActionButton onClick={openWrite}>
              <span className="inline-flex items-center justify-center gap-2"><TradeSellCtaContent /></span>
            </SellerHubEmptyActionButton>
          }
        />
      );
    }

    if (promotedOnly) {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_promoted", {
            fallbackKo: "홍보 중인 매물이 없어요",
            fallbackEn: "No promoted listings",
          })}
          hint={safeT("marketplace_seller_empty_listings_promoted_hint", {
            fallbackKo: "홍보 중만 보기가 켜져 있어요. 다른 매물을 보려면 필터를 해제해 주세요.",
            fallbackEn: "Promoted-only filter is on. Turn it off to see other listings.",
          })}
          actions={
            <>
              <SellerHubEmptyActionButton onClick={() => onPromotedOnlyChange(false)}>
                {clearPromoLabel}
              </SellerHubEmptyActionButton>
              {filter !== "all" ? (
                <SellerHubEmptyActionButton variant="secondary" onClick={() => onFilterChange("all")}>
                  {viewAllLabel}
                </SellerHubEmptyActionButton>
              ) : null}
            </>
          }
        />
      );
    }

    if (filter === "active") {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_active", {
            fallbackKo: "판매중인 매물이 없어요",
            fallbackEn: "No listings for sale",
          })}
          actions={
            <>
              <SellerHubEmptyActionButton onClick={openWrite}>
              <span className="inline-flex items-center justify-center gap-2"><TradeSellCtaContent /></span>
            </SellerHubEmptyActionButton>
              <SellerHubEmptyActionButton variant="secondary" onClick={() => onFilterChange("all")}>
                {viewAllLabel}
              </SellerHubEmptyActionButton>
            </>
          }
        />
      );
    }

    if (filter === "sold") {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_sold", {
            fallbackKo: "판매 완료된 매물이 없어요",
            fallbackEn: "No sold listings",
          })}
          actions={
            <SellerHubEmptyActionButton variant="secondary" onClick={() => onFilterChange("active")}>
              {safeT("marketplace_seller_listing_tab_active", {
                fallbackKo: "판매중",
                fallbackEn: "For sale",
              })}
            </SellerHubEmptyActionButton>
          }
        />
      );
    }

    if (filter === "hidden") {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_hidden", {
            fallbackKo: "숨긴 매물이 없어요",
            fallbackEn: "No hidden listings",
          })}
        />
      );
    }

    return (
      <SellerHubEmptyState
        message={t("mypage_comp_product_empty_filter")}
        actions={
          <SellerHubEmptyActionLink href="/market/sell" variant="secondary">
            {safeT("marketplace_sell_hub_title", {
              fallbackKo: "판매",
              fallbackEn: "Sell",
            })}
          </SellerHubEmptyActionLink>
        }
      />
    );
  };

  const loading = Boolean(currentUserId) && list.status === "loading";
  const bottomNavOccupies = useBottomNavOccupiesClearance();

  return (
    <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col ${resolveMyStickyCtaBodyClearanceClass(bottomNavOccupies)}`}>
      {loading ? (
        <MyProductsSkeleton />
      ) : currentUserId && list.status === "error" ? (
        <MyStateView kind="error" error={{ onRetry: () => void list.reload() }} />
      ) : products.length === 0 && !list.nextCursor ? (
        renderEmpty()
      ) : (
        <>
          <ul className="overflow-hidden rounded-ui-rect bg-sam-surface divide-y divide-sam-border-soft">
            {products.map((product) => (
              <li key={product.id}>
                <MyProductCard
                  product={product}
                  isPromoted={promotedTargetIds.has(product.id)}
                  tradeRows={tradesByPostId.get(product.id) ?? []}
                  buyerChatsLoadFailed={salesLoadFailed}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onPromotionChanged={refresh}
                />
              </li>
            ))}
          </ul>
          <MyListPager
            hasMore={Boolean(list.nextCursor)}
            loading={list.loadingMore}
            error={list.loadMoreError}
            onLoadMore={list.loadMore}
          />
        </>
      )}

      {/** 하단 고정 CTA — 내정보 공통 `MyStickyCta` (하단탭 바로 위 · 기기 전체 폭 · v3 §12) */}
      <MyStickyCta
        dirty
        primary={{
          label: createLabel,
          /** CTA-04: 판매 허브 「＋ 판매하기」와 같은 표기 */
          leadingIcon: <Plus className="h-5 w-5 shrink-0" aria-hidden />,
          onPress: openWrite,
          testId: "my-products-create-cta",
        }}
      />
    </div>
  );
}

/** 스켈레톤 — 카드 5개 [100×100 사진 + 가격 40% + 제목 2줄 + 지역 30% + 상태 1줄] (최종 설계 S20) */
function MyProductsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul
      aria-busy="true"
      data-testid="my-products-skeleton"
      className="overflow-hidden rounded-ui-rect bg-sam-surface divide-y divide-sam-border-soft"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex gap-3 px-3 py-3">
          <span className={`h-[100px] w-[100px] shrink-0 ${bone}`} />
          <span className="flex min-h-[100px] min-w-0 flex-1 flex-col justify-between py-0.5">
            <span className={`h-4 w-[40%] ${bone}`} />
            <span className={`h-3.5 w-[90%] ${bone}`} />
            <span className={`h-3.5 w-[65%] ${bone}`} />
            <span className={`h-3 w-[30%] ${bone}`} />
            <span className={`h-3 w-[45%] ${bone}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}
