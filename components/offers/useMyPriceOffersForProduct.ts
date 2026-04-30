"use client";

import { useEffect, useState } from "react";
import { usePriceOffersProductRealtime } from "@/hooks/usePriceOffersProductRealtime";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { normalizeOfferProductId } from "@/lib/offers/normalize-offer-product-id";
import type { PriceOfferListItem } from "@/lib/offers/types";

/**
 * 구매자 기준 `GET /api/offers/mine?productId=` — 최신순 전체(서버 limit 내).
 * 가격 제안 상품 상세 하단 CTA와 OfferStatusBuyer에서 동일 소스로 사용.
 */
export function useMyPriceOffersForProduct(
  productId: string,
  viewerUserId: string | null | undefined,
  refreshToken: number,
  enabled: boolean
): { offers: PriceOfferListItem[]; loading: boolean } {
  const [offers, setOffers] = useState<PriceOfferListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rtEpoch, setRtEpoch] = useState(0);

  const pidNorm = normalizeOfferProductId(productId);

  usePriceOffersProductRealtime(
    productId,
    Boolean(enabled && typeof viewerUserId === "string" && viewerUserId.trim() !== ""),
    () => setRtEpoch((n) => n + 1)
  );

  useEffect(() => {
    if (!enabled) {
      setOffers([]);
      setLoading(false);
      return;
    }
    if (viewerUserId === null) {
      setOffers([]);
      setLoading(false);
      return;
    }
    if (viewerUserId === undefined) {
      setOffers([]);
      setLoading(true);
      return;
    }
    if (!pidNorm) {
      setOffers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await runSingleFlight(`offers:mine:${pidNorm}:${refreshToken}:rt${rtEpoch}`, () =>
          fetch(`/api/offers/mine?productId=${encodeURIComponent(pidNorm)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; offers?: PriceOfferListItem[] };
        if (cancelled) return;
        if (res.ok && json.ok !== false && Array.isArray(json.offers)) {
          setOffers(json.offers);
        } else {
          setOffers([]);
        }
      } catch {
        if (!cancelled) setOffers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, pidNorm, refreshToken, rtEpoch, viewerUserId]);

  return { offers, loading };
}
