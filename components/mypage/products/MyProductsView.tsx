"use client";

import { useState, useCallback, useEffect } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  getMyProducts,
  updateProductStatus,
  updateProductSellerListingState,
  bumpProduct,
  deleteProduct,
  CURRENT_USER_ID,
} from "@/lib/products/my-products-mock";
import { normalizeSellerListingState, type SellerListingState } from "@/lib/products/seller-listing-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { sellerListingLabel } from "@/lib/mypage/seller-listing-i18n";
import { MyProductFilter } from "./MyProductFilter";
import { MyProductCard } from "./MyProductCard";
import {
  TradeBuyerPickerModal,
  type TradeBuyerPickCandidate,
} from "./TradeBuyerPickerModal";
import {
  dedupeBuyerCandidates,
  fetchPostBuyerChats,
  isActiveTradeChat,
  postSellerCompleteRequest,
  postSellerListingStateRequest,
} from "@/lib/trade/seller-trade-flow-client";

function filterByStatus(products: Product[], filter: MyProductFilterKey): Product[] {
  if (filter === "all") return products.filter((p) => p.status !== "hidden");
  return products.filter((p) => p.status === filter);
}

export function MyProductsView() {
  const { t } = useI18n();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MyProductFilterKey>("all");
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [buyerPicker, setBuyerPicker] = useState<{
    mode: "reserve" | "complete";
    productId: string;
    candidates: TradeBuyerPickCandidate[];
  } | null>(null);

  const products = filterByStatus(rawProducts, filter);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUserId(user?.id ?? null);
  }, []);

  const fetchMyPosts = useCallback(async (uid: string) => {
    const res = await runSingleFlight(`me:my-posts:${uid.trim()}`, () => fetch("/api/my/posts"));
    if (!res.ok) return [];
    const data = (await res.clone().json()) as { posts?: Product[] };
    return (data.posts ?? []) as Product[];
  }, []);

  useEffect(() => {
    if (currentUserId === null) {
      setLoading(false);
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      return;
    }
    if (!currentUserId) {
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyPosts(currentUserId)
      .then((list) => {
        if (!cancelled) setRawProducts(list);
      })
      .catch(() => {
        if (!cancelled) setRawProducts(getMyProducts(currentUserId, "all"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentUserId, fetchMyPosts]);

  useEffect(() => {
    if (!currentUserId) return;
    const run = () => {
      fetchMyPosts(currentUserId).then(setRawProducts).catch(() => {});
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
  }, [currentUserId, fetchMyPosts]);

  const refetchPostsSilent = useCallback(() => {
    if (!currentUserId) return;
    void fetchMyPosts(currentUserId).then(setRawProducts).catch(() => {});
  }, [currentUserId, fetchMyPosts]);

  useRefetchOnPageShowRestore(refetchPostsSilent, { enableVisibilityRefetch: false });

  const refresh = useCallback(() => {
    if (!currentUserId) {
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      return;
    }
    fetchMyPosts(currentUserId).then(setRawProducts);
  }, [currentUserId, fetchMyPosts]);

  const handleFilterChange = useCallback((value: MyProductFilterKey) => {
    setFilter(value);
  }, []);

  const handleStatusChange = useCallback(
    async (productId: string, newStatus: Product["status"]) => {
      if (!currentUserId) {
        updateProductStatus(productId, newStatus);
        refresh();
        return;
      }
      try {
        const res = await fetch(
          `/api/posts/${encodeURIComponent(productId)}/owner-status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: newStatus,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          window.alert(data.error ?? "상태 변경에 실패했습니다.");
          return;
        }
        refresh();
      } catch {
        window.alert(t("mypage_comp_product_network_change_failed"));
      }
    },
    [currentUserId, refresh, t]
  );

  const handleBump = useCallback(
    (productId: string) => {
      bumpProduct(productId);
      refresh();
    },
    [refresh]
  );

  const handleDelete = useCallback(
    (productId: string) => {
      deleteProduct(productId);
      refresh();
    },
    [refresh]
  );

  const handleSellerListingStateChange = useCallback(
    async (productId: string, state: SellerListingState) => {
      const product = rawProducts.find((p) => p.id === productId);
      if (!product) return;
      const current = normalizeSellerListingState(
        product.sellerListingState,
        product.status
      );
      if (state === current) return;
      const label = sellerListingLabel(t, state);

      if (typeof window === "undefined") return;

      if (state === "completed") {
        if (
          !window.confirm(t("mypage_comp_product_complete_confirm"))
        ) {
          return;
        }
      } else if (!window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))) {
        return;
      }

      setSavingListingId(productId);
      try {
        if (!currentUserId) {
          updateProductSellerListingState(productId, state);
          refresh();
          return;
        }

        if (state === "completed") {
          const data = await fetchPostBuyerChats(productId);
          if (data.error) {
            window.alert(data.error);
            return;
          }
          const items = (data.items ?? []).filter(isActiveTradeChat);
          const reservedId = data.reservedBuyerId?.trim() || "";
          const listingIsReserved =
            (data.sellerListingState ?? "").toLowerCase() === "reserved" ||
            product.status === "reserved";

          if (listingIsReserved && reservedId) {
            const row = items.find((i) => i.buyerId === reservedId);
            if (!row?.chatId) {
              window.alert(t("mypage_comp_product_reserved_chat_missing"));
              return;
            }
            const done = await postSellerCompleteRequest(row.chatId);
            if (!done.ok) {
              window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
              return;
            }
            refresh();
            return;
          }

          const candidates = dedupeBuyerCandidates(items);
          if (candidates.length === 0) {
            window.alert(t("mypage_comp_product_no_inquiry_for_complete"));
            return;
          }
          if (candidates.length === 1) {
            const done = await postSellerCompleteRequest(candidates[0].chatId);
            if (!done.ok) {
              window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
              return;
            }
            refresh();
            return;
          }
          setBuyerPicker({ mode: "complete", productId, candidates });
          return;
        }

        if (state === "reserved") {
          const data = await fetchPostBuyerChats(productId);
          if (data.error) {
            window.alert(data.error);
            return;
          }
          const items = (data.items ?? []).filter(isActiveTradeChat);
          const candidates = dedupeBuyerCandidates(items);
          if (candidates.length === 0) {
            window.alert(t("mypage_comp_product_reserve_inquiry_only"));
            return;
          }
          if (candidates.length === 1) {
            const saved = await postSellerListingStateRequest(productId, "reserved", candidates[0].buyerId);
            if (!saved.ok) {
              window.alert(saved.error ?? "저장에 실패했습니다.");
              return;
            }
            if (saved.warning) window.alert(saved.warning);
            refresh();
            return;
          }
          setBuyerPicker({ mode: "reserve", productId, candidates });
          return;
        }

        const saved = await postSellerListingStateRequest(productId, state);
        if (!saved.ok) {
          window.alert(saved.error ?? "저장에 실패했습니다.");
          return;
        }
        if (saved.warning) window.alert(saved.warning);
        refresh();
      } catch {
        window.alert(t("mypage_comp_product_network_save_failed"));
      } finally {
        setSavingListingId(null);
      }
    },
    [currentUserId, rawProducts, refresh, t]
  );

  const onBuyerPicked = useCallback(
    async (c: TradeBuyerPickCandidate) => {
      if (!buyerPicker) return;
      const { mode, productId } = buyerPicker;
      setBuyerPicker(null);
      setSavingListingId(productId);
      try {
        if (mode === "reserve") {
          const saved = await postSellerListingStateRequest(productId, "reserved", c.buyerId);
          if (!saved.ok) {
            window.alert(saved.error ?? "저장에 실패했습니다.");
            return;
          }
          if (saved.warning) window.alert(saved.warning);
        } else {
          const done = await postSellerCompleteRequest(c.chatId);
          if (!done.ok) {
            window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
            return;
          }
        }
        refresh();
      } catch {
        window.alert(t("mypage_comp_product_network_error_short"));
      } finally {
        setSavingListingId(null);
      }
    },
    [buyerPicker, refresh, t]
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TradeBuyerPickerModal
        open={buyerPicker != null}
        title={
          buyerPicker?.mode === "reserve"
            ? t("mypage_comp_product_pick_reserve_title")
            : t("mypage_comp_product_pick_complete_title")
        }
        subtitle={
          buyerPicker?.mode === "reserve"
            ? t("mypage_comp_product_pick_reserve_subtitle")
            : t("mypage_comp_product_pick_complete_subtitle")
        }
        candidates={buyerPicker?.candidates ?? []}
        onClose={() => setBuyerPicker(null)}
        onSelect={onBuyerPicked}
      />
      <MyProductFilter value={filter} onChange={handleFilterChange} />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="sam-text-body text-sam-muted">
            {filter === "all" ? t("mypage_comp_product_empty_all") : t("mypage_comp_product_empty_filter")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <MyProductCard
                product={product}
                onStatusChange={handleStatusChange}
                onBump={handleBump}
                onDelete={handleDelete}
                listingSaving={savingListingId === product.id}
                onSellerListingStateChange={handleSellerListingStateChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
