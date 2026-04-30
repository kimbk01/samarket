"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePriceOffersProductRealtime } from "@/hooks/usePriceOffersProductRealtime";
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";
import {
  broadcastPriceOfferCreatedForProduct,
  normalizeOfferProductId,
  PRICE_OFFERS_CHANGED_EVENT,
  priceOffersBumpStorageKey,
} from "@/lib/offers/normalize-offer-product-id";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

type Props = {
  productId: string;
  currency: string;
  viewerUserId?: string | null;
  refreshToken?: number;
  onChanged?: () => void;
  /** RSC에서 선로드한 목록 — 첫 페인트 즉시 표시, 이후 클라에서 한 번 더 정합 */
  initialOffers?: PriceOfferListItem[];
};

function statusLabel(status: PriceOfferListItem["status"]): string {
  switch (status) {
    case "accepted":
      return "수락됨";
    case "rejected":
      return "거절됨";
    case "expired":
      return "만료됨";
    default:
      return "대기중";
  }
}

export function OfferListSeller({
  productId,
  currency,
  viewerUserId,
  refreshToken = 0,
  onChanged,
  initialOffers,
}: Props) {
  const [offers, setOffers] = useState<PriceOfferListItem[]>(() => initialOffers ?? []);
  const [loading, setLoading] = useState(() => initialOffers === undefined);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [error, setError] = useState("");
  /** 탭 전환·다른 탭에서 제안 발생 시 목록 재요청 */
  const [resyncKey, setResyncKey] = useState(0);

  const pidNorm = normalizeOfferProductId(productId);

  usePriceOffersProductRealtime(productId, Boolean(viewerUserId && pidNorm), () =>
    setResyncKey((k) => k + 1)
  );

  useEffect(() => {
    const bump = () => setResyncKey((k) => k + 1);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === priceOffersBumpStorageKey(pidNorm)) bump();
    };
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ productId?: string }>).detail;
      if (d?.productId === pidNorm) bump();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    window.addEventListener(PRICE_OFFERS_CHANGED_EVENT, onCustom as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PRICE_OFFERS_CHANGED_EVENT, onCustom as EventListener);
    };
  }, [pidNorm]);

  useEffect(() => {
    if (initialOffers !== undefined) {
      setOffers(initialOffers);
    }
  }, [initialOffers]);

  useEffect(() => {
    if (!viewerUserId) {
      setOffers([]);
      setLoading(false);
      return;
    }
    if (!pidNorm) {
      setOffers([]);
      setLoading(false);
      setError("상품 정보가 올바르지 않습니다.");
      return;
    }
    let cancelled = false;
    const seededFromServer = initialOffers !== undefined;
    setLoading(!seededFromServer);
    setError("");
    forgetSingleFlightsWhere((k) => k.startsWith(`offers:received:${pidNorm}:`));
    void (async () => {
      try {
        const flightKey = `offers:received:${pidNorm}:rt${refreshToken}:rk${resyncKey}`;
        const res = await runSingleFlight(flightKey, () =>
          fetch(`/api/offers/received?productId=${encodeURIComponent(pidNorm)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          offers?: PriceOfferListItem[];
          error?: string;
        };
        if (!cancelled) {
          if (!res.ok || json.ok === false) {
            setOffers([]);
            const msg =
              typeof json.error === "string" && json.error.trim()
                ? json.error.trim()
                : "가격 제안을 불러오지 못했습니다.";
            setError(msg);
          } else {
            setOffers(Array.isArray(json.offers) ? json.offers : []);
          }
        }
      } catch {
        if (!cancelled) setError("가격 제안 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pidNorm, refreshToken, resyncKey, viewerUserId, initialOffers]);

  if (!viewerUserId) return null;

  return (
    <section className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-sam-fg">받은 가격 제안</h3>
        <Link href="/my/offers/received" className="text-[12px] font-semibold text-sam-primary">
          전체 보기
        </Link>
      </div>

      {loading ? <p className="mt-3 text-[12px] text-sam-muted">불러오는 중…</p> : null}
      {!loading && !error && offers.length === 0 ? (
        <div className="mt-3 space-y-1 text-[12px] text-sam-muted">
          <p>아직 도착한 가격 제안이 없습니다.</p>
          <p className="text-[11px] leading-snug">
            구매자 쪽에서 모달까지 열어 「제안 보내기」가 성공했는지 확인해 주세요. 보낸 직후에는 새로고침하거나 잠시 후 다시 열어 보세요.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[12px] text-sam-danger">{error}</p> : null}

      <div className="mt-3 space-y-2">
        {offers.map((offer) => {
          const busy = busyOfferId === offer.id;
          return (
            <article key={offer.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-app/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-semibold text-sam-fg">
                    {formatPrice(offer.offeredPrice, currency)}
                    <span className="ml-2 text-[12px] font-medium text-sam-muted">
                      ({offer.buyerNickname ?? "구매자"})
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] text-sam-muted">
                    원가 {formatPrice(offer.originalPrice, currency)} · {statusLabel(offer.status)}
                  </p>
                </div>
                {offer.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusyOfferId(offer.id);
                        setError("");
                        try {
                          const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/accept`, {
                            method: "POST",
                            credentials: "include",
                          });
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; offer?: { productId?: string } };
                          if (!res.ok || !json?.ok) {
                            setError(typeof json?.error === "string" ? json.error : "제안을 수락하지 못했습니다.");
                            return;
                          }
                          if (json.offer?.productId) {
                            broadcastPriceOfferCreatedForProduct(json.offer.productId);
                          }
                          setResyncKey((k) => k + 1);
                          onChanged?.();
                        } catch {
                          setError("네트워크 오류가 발생했습니다.");
                        } finally {
                          setBusyOfferId(null);
                        }
                      }}
                      className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusyOfferId(offer.id);
                        setError("");
                        try {
                          const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/reject`, {
                            method: "POST",
                            credentials: "include",
                          });
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; offer?: { productId?: string } };
                          if (!res.ok || !json?.ok) {
                            setError(typeof json?.error === "string" ? json.error : "제안을 거절하지 못했습니다.");
                            return;
                          }
                          if (json.offer?.productId) {
                            broadcastPriceOfferCreatedForProduct(json.offer.productId);
                          }
                          setResyncKey((k) => k + 1);
                          onChanged?.();
                        } catch {
                          setError("네트워크 오류가 발생했습니다.");
                        } finally {
                          setBusyOfferId(null);
                        }
                      }}
                      className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] font-semibold text-sam-fg disabled:opacity-60"
                    >
                      거절
                    </button>
                  </div>
                ) : null}
              </div>
              {offer.message ? (
                <p className="mt-2 text-[12px] leading-snug text-sam-muted">{offer.message}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
