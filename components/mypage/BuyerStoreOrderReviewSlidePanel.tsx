"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import {
  OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_EASING,
  OWNER_ORDER_CHAT_SLIDE_MS,
  OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS,
} from "@/lib/store-order-chat/owner-order-chat-slide-layout";

type SlidePhase = "enter-from-right" | "open" | "exit-to-right";

/** 구매자 `/orders` — 별점·리뷰 작성 우→좌 슬라이드 */
export function BuyerStoreOrderReviewSlidePanel({
  orderId,
  storeName,
  onClose,
  onSubmitted,
}: {
  orderId: string;
  storeName?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<SlidePhase>("enter-from-right");

  const requestClose = useCallback(() => {
    if (phase === "exit-to-right") return;
    setPhase("exit-to-right");
    window.setTimeout(() => onClose(), OWNER_ORDER_CHAT_SLIDE_MS);
  }, [onClose, phase]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [requestClose]);

  const panelOpen = phase === "open";
  const backdropVisible = phase === "open";
  const title =
    storeName?.trim() ? storeName.trim() : t("mypage_comp_store_review_title_default");

  return (
    <BodyPortal>
      <div
        className={`fixed inset-0 ${OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS} flex justify-end`}
        role="presentation"
      >
        <button
          type="button"
          className="min-w-0 flex-1 bg-black/30 transition-opacity"
          style={{
            opacity: backdropVisible ? 1 : 0,
            transitionDuration: `${OWNER_ORDER_CHAT_SLIDE_MS}ms`,
            transitionTimingFunction: OWNER_ORDER_CHAT_SLIDE_EASING,
          }}
          aria-label={t("common_close")}
          onClick={requestClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("tier1_review_write")}
          className={`delivery-ui flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[var(--safe-top)]`}
          style={{
            transform: panelOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: `transform ${OWNER_ORDER_CHAT_SLIDE_MS}ms ${OWNER_ORDER_CHAT_SLIDE_EASING}`,
            willChange: "transform",
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] px-2 py-2">
            <button
              type="button"
              onClick={requestClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--delivery-dark)] hover:bg-[color:var(--delivery-primary-soft)]"
              aria-label={t("common_close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 truncate text-[15px] font-bold leading-[1.35] text-[color:var(--delivery-dark)]">
              {title}
            </p>
          </header>

          <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-sam-surface">
            <StoreOrderReviewForm
              orderId={orderId}
              ordersHub
              layout="slide"
              onDismiss={requestClose}
              onSubmittedSuccess={() => {
                onSubmitted?.();
                requestClose();
              }}
            />
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
}
