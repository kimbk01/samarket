"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";
import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import { STORE_REVIEW_PREVIEW_CAROUSEL_MS } from "@/lib/stores/store-review-preview-slides";
import type { StoreReviewsPanelOpenOptions } from "@/lib/stores/store-reviews-panel-open";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { OverlayUi, OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";
import { useHubActive } from "@/lib/layout/hub-active-context";

export function StoreReviewsSlidePanel({
  open,
  storeSlug,
  options,
  onRequestClose,
}: {
  open: boolean;
  storeSlug: string;
  options: StoreReviewsPanelOpenOptions;
  onRequestClose: () => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(open);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useLayoutEffect(() => {
    if (open) {
      clearTimer();
      setVisible(true);
      setExiting(false);
      return;
    }
    if (!visible) return;
    setExiting(true);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, STORE_REVIEW_PREVIEW_CAROUSEL_MS);
    return clearTimer;
  }, [open, visible]);

  /** D1 S2: 숨긴 하단 탭 허브 안이면 화면 잠금을 풀어 둔다(다시 보이면 다시 잠금) */
  const hubActive = useHubActive();
  useEffect(() => {
    if (!visible || !hubActive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible, hubActive]);

  useEffect(() => clearTimer, []);

  /** S2-04 — Android 하드웨어 뒤로 = 패널 닫기 (매장 상세를 떠나지 않음) */
  useOverlayHardwareBack(open, onRequestClose);
  useRegisterOpenOverlay(open);

  if (!visible || !storeSlug.trim()) return null;

  return (
    <BodyPortal>
      <div
        className={`delivery-ui fixed inset-0 ${OVERLAY_Z_CLASS.sheet} flex justify-center`}
        role="dialog"
        aria-modal
        aria-label={t("store_reviews_title")}
      >
        <button
          type="button"
          className={`${OverlayUi.backdrop} !opacity-50`}
          aria-label={t("common_close")}
          onClick={onRequestClose}
        />
        <div
          className={`relative z-[1] flex h-[100dvh] w-full min-w-0 flex-col bg-white ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${
            exiting ? "store-reviews-panel-slide-out" : "store-reviews-panel-slide-in"
          }`}
        >
          <DeliverySubpageHeader
            title={t("store_reviews_title")}
            backVariant="close"
            onBack={onRequestClose}
            backLabel={t("common_close")}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 pb-10 pt-3 [-webkit-overflow-scrolling:touch]">
            <StoreReviewsSection
              storeSlug={storeSlug}
              surface="orderDetail"
              initialProductId={options.productId ?? null}
              initialPhotoOnly={options.photoOnly === true}
            />
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
