"use client";

import { useEffect, useMemo, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

type Props = {
  productId: string;
  currency: string;
  viewerUserId?: string | null;
  refreshToken?: number;
  /** 부모에서 주입 시 내부 fetch 생략 (상세 하단과 동일 목록) */
  offers?: PriceOfferListItem[];
  offersLoading?: boolean;
};

function statusLabel(status: PriceOfferListItem["status"]): string {
  if (status === "pending") return "⏳ 판매자 응답 대기";
  if (status === "accepted") return "✅ 제안이 수락되었습니다";
  if (status === "rejected") return "❌ 제안이 거절되었습니다";
  return "⏱ 제안이 만료되었습니다";
}

export function OfferStatusBuyer({
  productId,
  currency,
  viewerUserId,
  refreshToken = 0,
  offers: offersProp,
  offersLoading: offersLoadingProp,
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

  const primaryOffer = offers[0] ?? null;
  const olderOffers = offers.slice(1);

  const [historyOpen, setHistoryOpen] = useState(false);

  const primaryLabel = useMemo(() => {
    if (!primaryOffer) return null;
    return statusLabel(primaryOffer.status);
  }, [primaryOffer]);

  if (!viewerUserId || loadingState) return null;

  if (!primaryOffer || !primaryLabel) return null;

  return (
    <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-sam-fg">{primaryLabel}</p>
          <p className="mt-1 text-[12px] text-sam-muted">
            제안가 {formatPrice(primaryOffer.offeredPrice, currency)}
          </p>
          {primaryOffer.status === "rejected" || primaryOffer.status === "expired" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">
              하단의 <span className="font-semibold text-sam-fg">다시 제안하기</span>로 새 제안을 보낼 수 있어요. (같은 상품 하루 최대 3회)
            </p>
          ) : null}
          {primaryOffer.status === "accepted" ? (
            <p className="mt-2 text-[12px] leading-snug text-sam-muted">
              거래 채팅은 하단 <span className="font-semibold text-sam-fg">채팅하기</span>에서 이어가세요.
            </p>
          ) : null}
        </div>
        {/* 수락 후 채팅은 하단 고정 바에서만 노출 (중복 방지) */}
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
                  <span className="font-medium text-sam-fg">{statusLabel(o.status)}</span>
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
