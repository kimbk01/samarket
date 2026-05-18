"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePriceOffersProductRealtime } from "@/hooks/usePriceOffersProductRealtime";
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";
import {
  broadcastPriceOfferCreatedForProduct,
  normalizeOfferProductId,
  PRICE_OFFERS_CHANGED_EVENT,
  priceOffersBumpStorageKey,
} from "@/lib/offers/normalize-offer-product-id";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

type Props = {
  productId: string;
  currency: string;
  viewerUserId?: string | null;
  refreshToken?: number;
  onChanged?: () => void;
  /** RSC에서 선로드한 목록 — 첫 페인트 즉시 표시, 이후 클라에서 한 번 더 정합 */
  initialOffers?: PriceOfferListItem[];
  /** `modal`: 상세 본문 카드 없이 모달 본문용 레이아웃 */
  variant?: "card" | "modal";
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

/** 마켓플레이스형 흰 카드 위 뱃지 */
function modalStatusBadgeClass(status: PriceOfferListItem["status"]): string {
  switch (status) {
    case "accepted":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200";
    case "rejected":
      return "bg-[#E4E6EB] text-[#65676B] dark:bg-sam-surface-muted dark:text-sam-muted";
    case "expired":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    default:
      return "bg-[#E7F3FF] text-[#0866FF] dark:bg-sam-primary-soft dark:text-sam-primary";
  }
}

export function OfferListSeller({
  productId,
  currency,
  viewerUserId,
  refreshToken = 0,
  onChanged,
  initialOffers,
  variant = "card",
}: Props) {
  const { t } = useI18n();
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

  const submitAccept = useCallback(
    async (offerId: string) => {
      setBusyOfferId(offerId);
      setError("");
      try {
        const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/accept`, {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          offer?: { productId?: string };
        };
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
    },
    [onChanged]
  );

  const submitReject = useCallback(
    async (offerId: string) => {
      setBusyOfferId(offerId);
      setError("");
      try {
        const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/reject`, {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          offer?: { productId?: string };
        };
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
    },
    [onChanged]
  );

  if (!viewerUserId) return null;

  /** 모달에서 시드 데이터가 있으면 백그라운드 정합 중에도 로딩 문구 숨김(체감 즉시) */
  const showBlockingLoading =
    loading && !(variant === "modal" && offers.length > 0);

  const header =
    variant === "modal" ? null : (
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-sam-fg">{t("ui_offer_received_title")}</h3>
        <Link href="/my/offers/received" className="text-[12px] font-semibold text-sam-primary">
          전체 보기
        </Link>
      </div>
    );

  const body = (
    <>
      {showBlockingLoading ? (
        variant === "modal" && offers.length === 0 ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("ui_offer_loading_aria")}>
            <div className="h-[88px] animate-pulse rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-sam-surface" />
            <div className="h-[88px] animate-pulse rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-sam-surface" />
          </div>
        ) : (
          <p className={`${variant === "modal" ? "sam-text-body-secondary text-sam-muted" : "mt-3 text-[12px] text-sam-muted"}`}>
            {t("common_loading")}
          </p>
        )
      ) : null}
      {!loading && !error && offers.length === 0 ? (
        variant === "modal" ? (
          <div className="rounded-lg border border-black/[0.06] bg-white px-4 py-10 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-sam-border dark:bg-sam-surface dark:shadow-none">
            <p className="text-[15px] font-bold text-[#111111] dark:text-sam-fg">{t("ui_offer_empty_title")}</p>
            <p className="mt-2 text-[14px] font-normal leading-[1.65] text-[#222222] dark:text-sam-muted">
              구매자가 제안을 보내면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-1 text-[12px] text-sam-muted">
            <p>{t("ui_offer_empty_body")}</p>
            <p className="text-[11px] leading-snug">
              구매자 쪽에서 모달까지 열어 「제안 보내기」가 성공했는지 확인해 주세요. 보낸 직후에는 새로고침하거나 잠시 후 다시 열어 보세요.
            </p>
          </div>
        )
      ) : null}
      {error ? (
        variant === "modal" ? (
          <div className="rounded-lg border border-red-200 bg-white px-3 py-3 sam-text-body text-sam-danger dark:border-red-900/50 dark:bg-sam-surface">
            {error}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-sam-danger">{error}</p>
        )
      ) : null}

      <div className={`${variant === "modal" ? "space-y-2" : "mt-3 space-y-2"}`}>
        {offers.map((offer) => {
          const busy = busyOfferId === offer.id;
          const buyerLine = offer.buyerNickname?.trim() || "구매자";

          if (variant === "modal") {
            return (
              <article
                key={offer.id}
                className="rounded-lg border border-black/[0.08] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-sam-border dark:bg-sam-surface dark:shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug tabular-nums text-[#111111] dark:text-sam-fg">
                      {formatPrice(offer.offeredPrice, currency)}
                    </p>
                    <p className="mt-0.5 truncate text-[14px] font-normal leading-[1.2] text-[#777777] dark:text-sam-muted">
                      {buyerLine}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 sam-text-xxs font-semibold ${modalStatusBadgeClass(offer.status)}`}
                  >
                    {statusLabel(offer.status)}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-[1.4] text-[#999999] dark:text-sam-meta">
                  원가 {formatPrice(offer.originalPrice, currency)} · {t("ui_offer_date_label", { time: formatTimeAgo(offer.createdAt) })}
                </p>
                {offer.message?.trim() ? (
                  <div className="mt-2 rounded-md bg-[#F0F2F5] px-3 py-2 dark:bg-sam-surface-muted">
                    <p className="whitespace-pre-wrap text-[14px] font-normal leading-[1.65] text-[#222222] dark:text-sam-fg">
                      {offer.message.trim()}
                    </p>
                  </div>
                ) : null}
                {offer.status === "pending" ? (
                  <div className="mt-3 flex gap-2 border-t border-sam-border-soft pt-3 dark:border-sam-border">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitAccept(offer.id)}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-ui-rect bg-sam-primary text-[14px] font-semibold text-white disabled:opacity-60"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitReject(offer.id)}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-[14px] font-semibold text-sam-fg disabled:opacity-60 dark:bg-sam-surface-muted"
                    >
                      거절
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-sam-border-soft pt-3 text-center text-[12px] leading-[1.4] text-[#999999] dark:border-sam-border dark:text-sam-meta">
                    <span className="font-semibold text-[#111111] dark:text-sam-fg">{statusLabel(offer.status)}</span>{" "}
                    처리됨
                  </p>
                )}
              </article>
            );
          }

          return (
            <article key={offer.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-app/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-semibold text-sam-fg">
                    {formatPrice(offer.offeredPrice, currency)}
                    <span className="ml-2 text-[12px] font-medium text-sam-muted">({buyerLine})</span>
                  </p>
                  <p className="mt-1 text-[12px] text-sam-muted">
                    원가 {formatPrice(offer.originalPrice, currency)} · {statusLabel(offer.status)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-sam-muted">{t("ui_offer_date_label", { time: formatTimeAgo(offer.createdAt) })}</p>
                </div>
                {offer.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitAccept(offer.id)}
                      className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitReject(offer.id)}
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
    </>
  );

  if (variant === "modal") {
    return <div className="space-y-2">{body}</div>;
  }

  return (
    <section className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      {header}
      {body}
    </section>
  );
}
