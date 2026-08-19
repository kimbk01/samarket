"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useState, useCallback, useEffect } from "react";
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
import { MyProductFilter } from "./MyProductFilter";
import { MyProductCard } from "./MyProductCard";

export function MyProductsView() {
  const { t } = useI18n();
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getCurrentUser()?.id ?? null);
  const [filter, setFilter] = useState<MyProductFilterKey>("all");
  const [promotedOnly, setPromotedOnly] = useState(false);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [promotedTargetIds, setPromotedTargetIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

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
      const [list, ids] = await Promise.all([fetchMyPosts(uid), fetchPromotedTargetIds(uid)]);
      return { list, ids };
    },
    [fetchMyPosts, fetchPromotedTargetIds]
  );

  useEffect(() => {
    if (!currentUserId) {
      setRawProducts([]);
      setPromotedTargetIds(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadListing(currentUserId)
      .then(({ list, ids }) => {
        if (!cancelled) {
          setRawProducts(list);
          setPromotedTargetIds(ids);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRawProducts([]);
          setPromotedTargetIds(new Set());
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
        .then(({ list, ids }) => {
          setRawProducts(list);
          setPromotedTargetIds(ids);
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
      .then(({ list, ids }) => {
        setRawProducts(list);
        setPromotedTargetIds(ids);
      })
      .catch(() => {});
  }, [currentUserId, loadListing]);

  useRefetchOnPageShowRestore(refetchPostsSilent, { enableVisibilityRefetch: false });

  const refresh = useCallback(() => {
    if (!currentUserId) {
      setRawProducts([]);
      setPromotedTargetIds(new Set());
      return;
    }
    void loadListing(currentUserId).then(({ list, ids }) => {
      setRawProducts(list);
      setPromotedTargetIds(ids);
    });
  }, [currentUserId, loadListing]);

  const handleFilterChange = useCallback((value: MyProductFilterKey) => {
    setFilter(value);
  }, []);

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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MyProductFilter
        value={filter}
        onChange={handleFilterChange}
        promotedOnly={promotedOnly}
        onPromotedOnlyChange={setPromotedOnly}
      />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="sam-text-body text-sam-muted">
            {filter === "all" && !promotedOnly
              ? t("mypage_comp_product_empty_all")
              : t("mypage_comp_product_empty_filter")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <MyProductCard
                product={product}
                isPromoted={promotedTargetIds.has(product.id)}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
