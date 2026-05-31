"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";
import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import { STORE_REVIEW_PREVIEW_CAROUSEL_MS } from "@/lib/stores/store-review-preview-slides";
import type { StoreReviewsPanelOpenOptions } from "@/lib/stores/store-reviews-panel-open";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

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

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => clearTimer, []);

  if (!visible || !storeSlug.trim()) return null;

  return (
    <BodyPortal>
      <div
        className="delivery-ui fixed inset-0 z-[120] flex justify-center bg-black/25"
        role="dialog"
        aria-modal
        aria-label={t("store_reviews_title")}
      >
        <div
          className={`flex h-[100dvh] w-full min-w-0 flex-col bg-white ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${
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
