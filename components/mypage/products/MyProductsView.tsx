"use client";

import { Plus } from "lucide-react";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  collectActivePromotionTargetIds,
  filterMyProductsByListingAxis,
} from "@/lib/products/my-product-listing-filter";
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
import { Sam } from "@/lib/ui/sam-component-classes";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

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
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [promotedTargetIds, setPromotedTargetIds] = useState<Set<string>>(() => new Set());
  const [salesRows, setSalesRows] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const tradesByPostId = useMemo(() => groupSalesRowsByPostId(salesRows), [salesRows]);

  const products = filterMyProductsByListingAxis(
    rawProducts,
    filter,
    promotedOnly,
    promotedTargetIds
  );

  useEffect(() => {
    const syncUser = () => setCurrentUserId(getCurrentUser()?.id ?? null);
    syncUser();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
  }, []);

  const fetchMyPosts = useCallback(async (uid: string) => {
    const res = await runSingleFlight(`me:my-posts:${uid.trim()}`, () => fetch("/api/my/posts"));
    if (!res.ok) return [];
    const data = (await res.clone().json()) as { posts?: Product[] };
    return (data.posts ?? []) as Product[];
  }, []);

  const fetchPromotedTargetIds = useCallback(async (uid: string) => {
    const res = await runSingleFlight(`me:promotion-orders:get:${uid.trim()}`, () =>
      fetch("/api/me/points/promotion-orders", { cache: "no-store", credentials: "include" })
    );
    if (!res.ok) return new Set<string>();
    const data = (await res.clone().json()) as { ok?: boolean; orders?: PointPromotionOrder[] };
    if (!data.ok || !Array.isArray(data.orders)) return new Set<string>();
    return collectActivePromotionTargetIds(data.orders);
  }, []);

  const loadListing = useCallback(
    async (uid: string) => {
      const [list, ids, salesList] = await Promise.all([
        fetchMyPosts(uid),
        fetchPromotedTargetIds(uid),
        fetchTradeHistorySalesBySession().catch(() => []),
      ]);
      return { list, ids, salesRows: salesList as SalesHistoryRow[] };
    },
    [fetchMyPosts, fetchPromotedTargetIds]
  );

  useEffect(() => {
    if (!currentUserId) {
      setRawProducts([]);
      setPromotedTargetIds(new Set());
      setSalesRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadListing(currentUserId)
      .then(({ list, ids, salesRows: nextSalesRows }) => {
        if (!cancelled) {
          setRawProducts(list);
          setPromotedTargetIds(ids);
          setSalesRows(nextSalesRows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRawProducts([]);
          setPromotedTargetIds(new Set());
          setSalesRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, loadListing]);

  useEffect(() => {
    if (!currentUserId) return;
    const run = () => {
      loadListing(currentUserId)
        .then(({ list, ids, salesRows: nextSalesRows }) => {
          setRawProducts(list);
          setPromotedTargetIds(ids);
          setSalesRows(nextSalesRows);
        })
        .catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
  }, [currentUserId, loadListing]);

  const refetchPostsSilent = useCallback(() => {
    if (!currentUserId) return;
    void loadListing(currentUserId)
      .then(({ list, ids, salesRows: nextSalesRows }) => {
        setRawProducts(list);
        setPromotedTargetIds(ids);
        setSalesRows(nextSalesRows);
      })
      .catch(() => {});
  }, [currentUserId, loadListing]);

  useRefetchOnPageShowRestore(refetchPostsSilent, { enableVisibilityRefetch: false });

  const refresh = useCallback(() => {
    if (!currentUserId) {
      setRawProducts([]);
      setPromotedTargetIds(new Set());
      setSalesRows([]);
      return;
    }
    void loadListing(currentUserId).then(({ list, ids, salesRows: nextSalesRows }) => {
      setRawProducts(list);
      setPromotedTargetIds(ids);
      setSalesRows(nextSalesRows);
    });
  }, [currentUserId, loadListing]);

  const handleStatusChange = useCallback(
    async (productId: string, newStatus: Product["status"]) => {
      if (!currentUserId) return;
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(productId)}/owner-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          await dibayAlert({ title: data.error ?? "상태 변경에 실패했습니다." });
          return;
        }
        refresh();
      } catch {
        await dibayAlert({ title: t("mypage_comp_product_network_change_failed") });
      }
    },
    [currentUserId, refresh, t]
  );

  const handleDelete = useCallback(
    async (productId: string) => {
      if (!currentUserId) return;
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(productId)}/owner-delete`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          await dibayAlert({ title: data.error ?? t("mypage_comp_product_network_change_failed") });
          return;
        }
        refresh();
      } catch {
        await dibayAlert({ title: t("mypage_comp_product_network_change_failed") });
      }
    },
    [currentUserId, refresh, t]
  );

  const openWrite = useCallback(() => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  }, [guardBeforeNavigate, openTradeWriteSheet, writeCtx]);

  const createLabel = safeT("marketplace_sell_hub_create", {
    fallbackKo: "상품 등록",
    fallbackEn: "Post item",
  });

  const renderEmpty = () => {
    const viewAllLabel = safeT("marketplace_seller_cta_view_all_listings", {
      fallbackKo: "전체 매물 보기",
      fallbackEn: "View all listings",
    });
    const clearPromoLabel = safeT("marketplace_seller_cta_clear_promoted_only", {
      fallbackKo: "홍보 중만 해제",
      fallbackEn: "Show all listings",
    });

    if (filter === "all" && !promotedOnly) {
      return (
        <SellerHubEmptyState
          message={safeT("marketplace_seller_empty_listings_all", {
            fallbackKo: "등록한 매물이 없어요",
            fallbackEn: "No listings yet",
          })}
          actions={
            <SellerHubEmptyActionButton onClick={openWrite}>{createLabel}</SellerHubEmptyActionButton>
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
              <SellerHubEmptyActionButton onClick={openWrite}>{createLabel}</SellerHubEmptyActionButton>
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

  return (
    <div className="flex min-w-0 flex-col pb-28">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>
        </div>
      ) : products.length === 0 ? (
        renderEmpty()
      ) : (
        <ul className="overflow-hidden rounded-ui-rect bg-sam-surface divide-y divide-sam-border-soft">
          {products.map((product) => (
            <li key={product.id}>
              <MyProductCard
                product={product}
                isPromoted={promotedTargetIds.has(product.id)}
                tradeRows={tradesByPostId.get(product.id) ?? []}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ul>
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-20 border-t border-sam-border bg-sam-app/95 backdrop-blur-sm ${APP_MAIN_GUTTER_X_CLASS} pt-3 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}
      >
        <button
          type="button"
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} flex items-center justify-center gap-2 py-3.5`}
          onClick={openWrite}
        >
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
          <span>{createLabel}</span>
        </button>
      </div>
    </div>
  );
}
