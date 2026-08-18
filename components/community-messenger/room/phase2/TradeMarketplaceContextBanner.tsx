"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  productTitle: string;
  priceLabel: string | null;
  detailHref: string | null;
  onMoreOptions: () => void;
};

/** TRADE-only Marketplace listing strip under the room header. Do not use on general/order. */
export function TradeMarketplaceContextBanner({
  productTitle,
  priceLabel,
  detailHref,
  onMoreOptions,
}: Props) {
  const { t } = useI18n();
  const headline = [priceLabel, productTitle].filter(Boolean).join(" - ");
  return (
    <div
      data-cm-trade-marketplace-banner=""
      className="shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5"
    >
      <div className="flex items-center gap-1.5 text-[color:var(--cm-room-text-muted)]">
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <p className="sam-text-xxs font-semibold">{t("cm_ui_trade_listing_item")}</p>
      </div>
      <p className="mt-1 truncate sam-text-body font-semibold leading-snug text-[color:var(--cm-room-text)]">
        {headline}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {detailHref ? (
          <Link
            href={detailHref}
            className="rounded-ui-rect bg-[color:var(--cm-room-primary-soft)] px-2 py-2 text-center sam-text-helper font-medium text-[color:var(--cm-room-text)] active:opacity-80"
          >
            {t("cm_ui_trade_view_details")}
          </Link>
        ) : (
          <span className="rounded-ui-rect bg-[color:var(--cm-room-primary-soft)] px-2 py-2 text-center sam-text-helper font-medium text-[color:var(--cm-room-text-muted)]">
            {t("cm_ui_trade_view_details")}
          </span>
        )}
        <button
          type="button"
          onClick={onMoreOptions}
          className="rounded-ui-rect bg-[color:var(--cm-room-primary-soft)] px-2 py-2 text-center sam-text-helper font-medium text-[color:var(--cm-room-text)] active:opacity-80"
        >
          {t("cm_ui_trade_more_options")}
        </button>
      </div>
    </div>
  );
}
