"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";
import { pickBuyerPrimaryOffer } from "@/lib/offers/pick-buyer-primary-offer";

type Props = {
  productId: string;
  currency: string;
  viewerUserId?: string | null;
  refreshToken?: number;
  /** 부모에서 주입 시 내부 fetch 생략 (상세 하단과 동일 목록) */
  offers?: PriceOfferListItem[];
  offersLoading?: boolean;
  onContinueChat?: () => void;
  onRetryOffer?: () => void;
};

export function OfferStatusBuyer({
  productId,
  currency,
  viewerUserId,
  refreshToken = 0,
  offers: offersProp,
  offersLoading: offersLoadingProp,
  onContinueChat,
  onRetryOffer,
}: Props) {
  const { t } = useI18n();
  const [internalOffers, setInternalOffers] = useState<PriceOfferListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const controlled = offersProp !== undefined;

  useEffect(() => {
    if (controlled) return;
    if (!viewerUserId) {
      setInternalOffers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await runSingleFlight(`offers:mine:${productId}`, () =>
          fetch(`/api/offers/mine?productId=${encodeURIComponent(productId)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as { offers?: PriceOfferListItem[] };
        if (cancelled) return;
        setInternalOffers(Array.isArray(json.offers) ? json.offers : []);
      } catch {
        if (!cancelled) setInternalOffers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlled, productId, refreshToken, viewerUserId]);

  const offers = controlled ? offersProp! : internalOffers;
  const loadingState = controlled ? (offersLoadingProp ?? false) : loading;

  const primaryOffer = useMemo(() => pickBuyerPrimaryOffer(offers), [offers]);
  const olderOffers = useMemo(() => {
    if (!primaryOffer) return [];
    return offers
      .filter((o) => o.id !== primaryOffer.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [offers, primaryOffer]);

  const [historyOpen, setHistoryOpen] = useState(false);

  const offerStatusTitle = useCallback(
    (status: PriceOfferListItem["status"]) => {
      if (status === "pending") return t("ui_offer_status_pending");
      if (status === "accepted") return t("ui_offer_status_accepted");
      if (status === "rejected") return t("ui_offer_status_rejected");
      return t("ui_offer_status_expired");
    },
    [t],
  );

  const title = useMemo(() => {
    if (!primaryOffer) return null;
    return offerStatusTitle(primaryOffer.status);
  }, [primaryOffer, offerStatusTitle]);

  if (!viewerUserId) return null;
  if ((loadingState && !primaryOffer) || !primaryOffer || !title) return null;

  return (
    <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
          <p className="mt-1 text-[12px] text-sam-muted">
            {t("ui_offer_my_price", { price: formatPrice(primaryOffer.offeredPrice, currency) })}
            {" · "}
            {t("ui_offer_list_price", { price: formatPrice(primaryOffer.originalPrice, currency) })}
          </p>
          {primaryOffer.status === "pending" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">{t("ui_offer_waiting_seller")}</p>
          ) : null}
          {primaryOffer.status === "rejected" || primaryOffer.status === "expired" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">
              {t("ui_offer_retry_hint", { retry: t("ui_offer_retry_label") })}
            </p>
          ) : null}
        </div>
        {primaryOffer.status === "accepted" && onContinueChat ? (
          <button
            type="button"
            onClick={onContinueChat}
            className="shrink-0 rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white"
          >
            {t("ui_offer_chat_continue")}
          </button>
        ) : null}
        {(primaryOffer.status === "rejected" || primaryOffer.status === "expired") && onRetryOffer ? (
          <button
            type="button"
            onClick={onRetryOffer}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
          >
            {t("ui_offer_retry_label")}
          </button>
        ) : null}
      </div>
      {primaryOffer.message ? (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-sam-muted">{primaryOffer.message}</p>
      ) : null}

      {olderOffers.length > 0 ? (
        <div className="mt-3 border-t border-sam-border pt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="text-[12px] font-medium text-sam-primary"
          >
            {historyOpen
              ? t("ui_offer_history_collapse")
              : t("ui_offer_history_expand", { count: olderOffers.length })}
          </button>
          {historyOpen ? (
            <ul className="mt-2 space-y-2">
              {olderOffers.map((o) => (
                <li
                  key={o.id}
                  className="rounded-ui-rect border border-sam-border-soft bg-sam-surface/60 px-2 py-1.5 text-[12px] text-sam-muted"
                >
                  <span className="font-medium text-sam-fg">{offerStatusTitle(o.status)}</span>
                  {" · "}
                  {formatPrice(o.offeredPrice, currency)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
