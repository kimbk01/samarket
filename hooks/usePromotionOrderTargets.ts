"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";
import {
  fetchMeStoresListDeduped,
  parseStoreRowsFromMeStoresJson,
} from "@/lib/me/fetch-me-stores-deduped";

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
  /** R-77: 내 글 목록 조회 실패 — 「등록된 상품 없음」과 구분 */
  failed: boolean;
  refresh: () => Promise<void>;
} {
  const [productOptions, setProductOptions] = useState<PromotionProductOption[]>([]);
  const [shopOptions, setShopOptions] = useState<PromotionShopOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setUnauthorized(false);
    setFailed(false);
    try {
      // Stores: me-stores TTL/single-flight authority. Posts remain independent.
      // 글 목록 본문은 비행 안에서 1회만 파싱 — 합류한 호출(StrictMode 재마운트·폼 2곳)이 같은 Response 를 두 번 읽지 않게 한다.
      const [postsRes, storesResult] = await runSingleFlight("me:promotion-targets", () =>
        Promise.all([
          fetch("/api/my/posts", { cache: "no-store", credentials: "include" }).then(async (res) => ({
            status: res.status,
            ok: res.ok,
            json: res.ok
              ? ((await res.json().catch(() => ({}))) as {
                  posts?: { id?: string; title?: string; status?: string; sellerListingState?: string }[];
                })
              : null,
          })),
          fetchMeStoresListDeduped(),
        ])
      );

      if (postsRes.status === 401 || storesResult.status === 401) {
        setUnauthorized(true);
        setProductOptions([]);
        setShopOptions([]);
        return;
      }

      if (postsRes.ok && postsRes.json) {
        /** 광고 감사 TB-08: 판매완료·거래완료·숨김 글은 고를 수 없다 — 거래 카드 「광고하기」와 같은 판정 1곳 */
        const products = (postsRes.json.posts ?? [])
          .filter((p) => p.id && isPostEligibleForPromotionBoost(p.status, p.sellerListingState))
          .map((p) => ({
            id: String(p.id),
            /** 빈 제목은 화면이 문구 키로 채운다(코드 안 한국어 금지) */
            title: String(p.title ?? "").trim(),
          }));
        setProductOptions(products);
      } else {
        setProductOptions([]);
        /** R-77: 글 목록 조회 실패 = 「불러오지 못했어요」 (「등록된 상품이 없습니다」 아님) */
        setFailed(true);
      }

      if (storesResult.status === 200) {
        const stores = parseStoreRowsFromMeStoresJson(storesResult.json) ?? [];
        const shops = stores
          .filter((s) => {
            if (!s.id) return false;
            const st = String(s.approval_status ?? "").toLowerCase();
            return st === "approved" || st === "active";
          })
          .map((s) => ({
            id: String(s.id),
            shopName: String(s.store_name ?? "").trim() || "(매장)",
          }));
        setShopOptions(shops);
      } else {
        setShopOptions([]);
      }
    } catch {
      setProductOptions([]);
      setShopOptions([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { productOptions, shopOptions, loading, unauthorized, failed, refresh };
}
