"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export interface PromotionProductOption {
  id: string;
  title: string;
}

export interface PromotionShopOption {
  id: string;
  shopName: string;
}

/** 포인트 프로모션 신청 폼 — 내 거래 상품·승인된 매장 (DB API) */
export function usePromotionOrderTargets(): {
  productOptions: PromotionProductOption[];
  shopOptions: PromotionShopOption[];
  loading: boolean;
  unauthorized: boolean;
  refresh: () => Promise<void>;
} {
  const [productOptions, setProductOptions] = useState<PromotionProductOption[]>([]);
  const [shopOptions, setShopOptions] = useState<PromotionShopOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setUnauthorized(false);
    try {
      const [postsRes, storesRes] = await runSingleFlight("me:promotion-targets", () =>
        Promise.all([
          fetch("/api/my/posts", { cache: "no-store", credentials: "include" }),
          fetch("/api/me/stores", { cache: "no-store", credentials: "include" }),
        ])
      );

      if (postsRes.status === 401 || storesRes.status === 401) {
        setUnauthorized(true);
        setProductOptions([]);
        setShopOptions([]);
        return;
      }

      if (postsRes.ok) {
        const j = (await postsRes.json()) as { posts?: { id?: string; title?: string; status?: string }[] };
        const products = (j.posts ?? [])
          .filter((p) => p.id && p.status !== "hidden" && p.status !== "deleted")
          .map((p) => ({
            id: String(p.id),
            title: String(p.title ?? "").trim() || "(제목 없음)",
          }));
        setProductOptions(products);
      } else {
        setProductOptions([]);
      }

      if (storesRes.ok) {
        const j = (await storesRes.json()) as {
          stores?: {
            id?: string;
            store_name?: string;
            shopName?: string;
            approval_status?: string;
            approvalStatusRaw?: string;
            status?: string;
          }[];
        };
        const shops = (j.stores ?? [])
          .filter((s) => {
            if (!s.id) return false;
            const st = String(
              s.approval_status ?? s.approvalStatusRaw ?? s.status ?? ""
            ).toLowerCase();
            return st === "approved" || st === "active";
          })
          .map((s) => ({
            id: String(s.id),
            shopName: String(s.store_name ?? s.shopName ?? "").trim() || "(매장)",
          }));
        setShopOptions(shops);
      } else {
        setShopOptions([]);
      }
    } catch {
      setProductOptions([]);
      setShopOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { productOptions, shopOptions, loading, unauthorized, refresh };
}
