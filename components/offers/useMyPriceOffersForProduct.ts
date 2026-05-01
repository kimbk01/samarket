"use client";

import { useEffect, useMemo, useState } from "react";
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
  enabled: boolean,
  /** RSC 시드 — 첫 페인트에서 CTA 즉시 (추가 왕복 없음) */
  serverSeedOffers?: PriceOfferListItem[]
): { offers: PriceOfferListItem[]; loading: boolean } {
  const [offers, setOffers] = useState<PriceOfferListItem[]>(() => serverSeedOffers ?? []);
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false;
    if (viewerUserId === undefined) return true;
    if (viewerUserId === null) return false;
    const pid = normalizeOfferProductId(productId);
    if (!pid) return false;
    return serverSeedOffers === undefined;
  });
  const [rtEpoch, setRtEpoch] = useState(0);

  const pidNorm = normalizeOfferProductId(productId);
  const serverSeedFingerprint = useMemo(() => {
    if (serverSeedOffers === undefined) return "";
    if (serverSeedOffers.length === 0) return "empty";
    return serverSeedOffers.map((o) => `${o.id}:${o.status}`).join(",");
  }, [serverSeedOffers]);

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
      if (serverSeedOffers !== undefined) {
        setLoading(false);
        return;
      }
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
    const hasServerSeed = serverSeedOffers !== undefined;
    if (!hasServerSeed) {
      setLoading(true);
    }
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
        } else if (!cancelled) {
          setOffers((prev) => (prev.length > 0 ? prev : []));
        }
      } catch {
        if (!cancelled) setOffers((prev) => (prev.length > 0 ? prev : []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, pidNorm, refreshToken, rtEpoch, viewerUserId]);

  useEffect(() => {
    if (serverSeedOffers === undefined) return;
    setOffers(serverSeedOffers);
    setLoading(false);
  }, [pidNorm, serverSeedFingerprint, serverSeedOffers]);

  return { offers, loading };
}
