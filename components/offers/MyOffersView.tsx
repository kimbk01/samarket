"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tag } from "lucide-react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { broadcastPriceOfferCreatedForProduct } from "@/lib/offers/normalize-offer-product-id";
import { openCreateTradeChat } from "@/lib/chats/trade-chat-entry-navigation";
import type { PriceOfferListItem, PriceOfferStatus } from "@/lib/offers/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import {
  fetchMypageListJson,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { Sam } from "@/lib/ui/sam-component-classes";

export type MyOffersMode = "sent" | "received";

/** 상태 라벨 — i18n (한국어 하드코딩 맵 제거, 최종 설계 S23) */
export const OFFER_STATUS_LABEL_KEY: Record<PriceOfferStatus, MessageKey> = {
  pending: "ui_offer_status_pending",
  accepted: "ui_offer_status_accepted",
  rejected: "ui_offer_status_rejected",
  withdrawn: "ui_offer_status_withdrawn",
};

function statusBadgeClass(status: PriceOfferStatus): string {
  switch (status) {
    case "pending":
      return "bg-sam-warning-soft text-sam-fg";
    case "accepted":
      return "bg-sam-success-soft text-sam-success";
    case "rejected":
      return "bg-sam-danger-soft text-sam-danger";
    default:
      return "bg-sam-surface-muted text-sam-muted";
  }
}

export function myOffersEndpoint(mode: MyOffersMode): string {
  return mode === "sent" ? "/api/offers/mine" : "/api/offers/received";
}

type Props = {
  mode: MyOffersMode;
  emptyLabel: string;
  /** 대기 건수 — 탭 라벨 `(n)` */
  onPendingCount?: (mode: MyOffersMode, count: number) => void;
};

/**
 * 가격 제안 목록 1탭 (최종 설계 S23). 탭 셸은 `/mypage/offers` 페이지(`?tab=received|sent`).
 * - 받은·대기: [수락](즉시) · [거절](확인 시트 danger 후에만 API)
 * - 보낸·대기: [제안 철회](확인 시트, M4) · 보낸·수락: 채팅 · 보낸·거절/철회: 다시 제안
 * - 실패는 i18n 오류 토스트(서버 원문 노출 금지). 로딩 = 행 스켈레톤, 오류 = 오류+재시도(빈 문구와 동시 표시 금지).
 */
export function MyOffersView({ mode, emptyLabel, onPendingCount }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const viewer = getCurrentUser()?.id ?? "session";
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<PriceOfferListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PriceOfferListItem | null>(null);
  const { run } = useMypageSubmitGuard();

  const fetchPage = useCallback(
    async (): Promise<MypageCursorPage<PriceOfferListItem>> => {
      const json = await runSingleFlight(`my-offers:${mode}`, () =>
        fetchMypageListJson<{ offers?: PriceOfferListItem[] }>(myOffersEndpoint(mode))
      );
      return { items: Array.isArray(json.offers) ? json.offers : [], next_cursor: null };
    },
    [mode]
  );
  const list = useMypageCursorList<PriceOfferListItem>({
    cacheKey: `my-offers:${viewer}:${mode}`,
    fetchPage,
    getId: (o) => o.id,
  });
  const { setItems } = list;

  const pendingCount = list.items.filter((o) => o.status === "pending").length;
  useEffect(() => {
    if (list.status === "ready") onPendingCount?.(mode, pendingCount);
  }, [list.status, mode, onPendingCount, pendingCount]);

  const setStatus = useCallback(
    (offerId: string, status: PriceOfferStatus) => {
      setItems((prev) => prev.map((item) => (item.id === offerId ? { ...item, status } : item)));
    },
    [setItems]
  );

  const transition = useCallback(
    (offer: PriceOfferListItem, action: "accept" | "reject" | "withdraw") =>
      run(async () => {
        setBusyOfferId(offer.id);
        const failKey: MessageKey =
          action === "withdraw"
            ? "ui_offer_withdraw_failed"
            : action === "accept"
              ? "mypage_r5_offer_accept_failed"
              : "mypage_r5_offer_reject_failed";
        try {
          const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/${action}`, {
            method: "POST",
            credentials: "include",
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; offer?: PriceOfferListItem };
          if (!res.ok || !json?.ok) {
            showMypageToast(t(failKey), "error");
            return;
          }
          broadcastPriceOfferCreatedForProduct(json.offer?.productId ?? offer.productId);
          setStatus(
            offer.id,
            action === "accept" ? "accepted" : action === "reject" ? "rejected" : "withdrawn"
          );
          invalidateMypageSummary();
        } catch {
          showMypageToast(t(failKey), "error");
        } finally {
          setBusyOfferId(null);
        }
      }),
    [run, setStatus, t]
  );

  if (list.status === "loading") {
    return <MyOffersSkeleton />;
  }

  if (list.status === "error") {
    return (
      <MyStateView
        kind="error"
        error={{ message: t("mypage_r5_offer_load_failed"), onRetry: () => void list.reload() }}
      />
    );
  }

  if (list.items.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{
          icon: <Tag className="h-6 w-6" aria-hidden />,
          title: emptyLabel,
          cta:
            mode === "sent" ? (
              <Link href="/market" className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}>
                {t("mypage_r5_trade_browse")}
              </Link>
            ) : undefined,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`my-offers-${mode}`}>
      {list.items.map((offer) => {
        const busy = busyOfferId === offer.id;
        const actions: ReactNode[] = [];
        if (mode === "sent" && offer.status === "pending") {
          actions.push(
            <button
              key="withdraw"
              type="button"
              disabled={busy}
              onClick={() => setWithdrawTarget(offer)}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} w-full md:w-auto`}
            >
              {t("ui_offer_withdraw")}
            </button>
          );
        }
        if (mode === "sent" && offer.status === "accepted") {
          actions.push(
            <button
              key="chat"
              type="button"
              onClick={() =>
                openCreateTradeChat(router, {
                  productId: offer.productId,
                  composePreview: {
                    productTitle: offer.productTitle.trim() || t("mypage_r5_offer_product_fallback"),
                    productThumbnail: offer.productThumbnailUrl?.trim() ?? "",
                    priceText: formatMypageMoney(offer.originalPrice),
                    sellerName: offer.sellerNickname?.trim() || t("mypage_r5_offer_seller_fallback"),
                  },
                })
              }
              className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} col-span-2 w-full md:w-auto`}
            >
              {t("ui_offer_chat_continue")}
            </button>
          );
        }
        if (mode === "sent" && (offer.status === "rejected" || offer.status === "withdrawn")) {
          actions.push(
            <button
              key="retry"
              type="button"
              onClick={() => router.push(offer.productHref)}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} col-span-2 w-full md:w-auto`}
            >
              {t("ui_offer_retry_label")}
            </button>
          );
        }
        if (mode === "received" && offer.status === "pending") {
          actions.push(
            <button
              key="reject"
              type="button"
              disabled={busy}
              onClick={() => setRejectTarget(offer)}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} w-full md:w-auto`}
              data-testid="offer-reject"
            >
              {t("mypage_r5_offer_reject")}
            </button>,
            <button
              key="accept"
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void transition(offer, "accept")}
              className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} w-full md:w-auto`}
              data-testid="offer-accept"
            >
              {t("mypage_r5_offer_accept")}
            </button>
          );
        }
        const dateText = formatMypageDate(offer.createdAt, { style: "relative" });
        return (
          <article
            key={offer.id}
            className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 md:px-5"
            data-offer-id={offer.id}
          >
            <div className="flex items-start gap-3">
              <Link
                href={offer.productHref}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted"
              >
                <SamarketThumbnail
                  src={offer.productThumbnailUrl}
                  fill
                  roundedClassName="rounded-ui-rect"
                  className="bg-sam-surface-muted"
                  fallbackSrc=""
                  fallbackNode={
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-sam-muted">
                      {t("ui_product_gallery_fallback")}
                    </div>
                  }
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={offer.productHref} className="block truncate sam-text-body font-semibold text-sam-fg">
                  {offer.productTitle}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${statusBadgeClass(offer.status)}`}
                  >
                    {t(OFFER_STATUS_LABEL_KEY[offer.status] ?? "ui_offer_status_pending")}
                  </span>
                  {dateText ? <span className="sam-text-helper text-sam-meta">{dateText}</span> : null}
                </div>
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {t("ui_offer_list_price", { price: formatMypageMoney(offer.originalPrice) })}
                </p>
              </div>
              <p className="shrink-0 text-right sam-text-body font-bold text-sam-fg">
                {formatMypageMoney(offer.offeredPrice)}
              </p>
            </div>
            {offer.message ? (
              <p className="mt-2 sam-text-helper leading-snug text-sam-muted">{offer.message}</p>
            ) : null}
            {actions.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:justify-end">{actions}</div>
            ) : null}
          </article>
        );
      })}
      <MobileConfirmBottomSheet
        open={withdrawTarget != null}
        onCancel={() => setWithdrawTarget(null)}
        title={t("ui_offer_withdraw_confirm_title")}
        description={t("ui_offer_withdraw_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("ui_offer_withdraw")}
        onConfirm={() => {
          const target = withdrawTarget;
          setWithdrawTarget(null);
          if (target) void transition(target, "withdraw");
        }}
      />
      <MobileConfirmBottomSheet
        open={rejectTarget != null}
        onCancel={() => setRejectTarget(null)}
        title={t("mypage_r5_offer_reject_confirm_title")}
        description={t("mypage_r5_offer_reject_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("mypage_r5_offer_reject")}
        confirmTone="danger"
        onConfirm={() => {
          const target = rejectTarget;
          setRejectTarget(null);
          if (target) void transition(target, "reject");
        }}
      />
    </div>
  );
}

/** 스켈레톤 — 행 5개(56 썸네일 + 2줄 + 우측 금액 블록) */
function MyOffersSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="my-offers-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3">
          <span className={`h-14 w-14 shrink-0 ${bone}`} />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 w-[60%] ${bone}`} />
            <span className={`h-3 w-[40%] ${bone}`} />
          </span>
          <span className={`h-4 w-14 shrink-0 ${bone}`} />
        </div>
      ))}
    </div>
  );
}
