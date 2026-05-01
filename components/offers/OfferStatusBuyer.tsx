"use client";

import { useEffect, useMemo, useState } from "react";
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

function cardTitle(status: PriceOfferListItem["status"]): string {
  if (status === "pending") return "제안 대기중";
  if (status === "accepted") return "제안 수락됨";
  if (status === "rejected") return "제안 거절됨";
  return "제안 만료됨";
}

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

  const title = useMemo(() => {
    if (!primaryOffer) return null;
    return cardTitle(primaryOffer.status);
  }, [primaryOffer]);

  if (!viewerUserId) return null;
  if ((loadingState && !primaryOffer) || !primaryOffer || !title) return null;

  return (
    <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
          <p className="mt-1 text-[12px] text-sam-muted">
            내 제안가 {formatPrice(primaryOffer.offeredPrice, currency)}
            {" · "}
            판매가 {formatPrice(primaryOffer.originalPrice, currency)}
          </p>
          {primaryOffer.status === "pending" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">판매자 응답 대기중입니다.</p>
          ) : null}
          {primaryOffer.status === "rejected" || primaryOffer.status === "expired" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">
              하단의 <span className="font-semibold text-sam-fg">다시 제안하기</span>로 새 제안을 보낼 수 있어요. (같은 상품 하루 최대 3회)
            </p>
          ) : null}
        </div>
        {primaryOffer.status === "accepted" && onContinueChat ? (
          <button
            type="button"
            onClick={onContinueChat}
            className="shrink-0 rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white"
          >
            채팅 이어가기
          </button>
        ) : null}
        {(primaryOffer.status === "rejected" || primaryOffer.status === "expired") && onRetryOffer ? (
          <button
            type="button"
            onClick={onRetryOffer}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
          >
            다시 제안하기
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
            {historyOpen ? "이전 제안 접기" : `이전 제안 ${olderOffers.length}건 보기`}
          </button>
          {historyOpen ? (
            <ul className="mt-2 space-y-2">
              {olderOffers.map((o) => (
                <li
                  key={o.id}
                  className="rounded-ui-rect border border-sam-border-soft bg-sam-surface/60 px-2 py-1.5 text-[12px] text-sam-muted"
                >
                  <span className="font-medium text-sam-fg">{cardTitle(o.status)}</span>
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
