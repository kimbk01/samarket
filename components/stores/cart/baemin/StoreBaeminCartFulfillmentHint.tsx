"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function StoreBaeminCartFulfillmentHint({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <p className="text-center text-[14px] font-medium text-[color:var(--delivery-text-sub)]">
      {t("store_cart_fulfillment_select_hint")}
      <span
        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--delivery-border)] text-[10px] text-[color:var(--delivery-text-muted)]"
        aria-hidden
      >
        i
      </span>
    </p>
  );
}
