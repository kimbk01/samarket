"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { StoresBrowseInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import { writeStoreCheckoutCouponSession } from "@/lib/stores/store-checkout-coupon-session";
import { formatMoneyPhp } from "@/lib/utils/format";

export function StoreBrowseInsertionPaidAdCard({
  row,
  storeSlug,
}: {
  row: Extract<StoresBrowseInsertionMetaRow, { kind: "paid_ad" }>;
  storeSlug?: string | null;
}) {
  const { t } = useI18n();
  const href = storeSlug ? `/stores/${encodeURIComponent(storeSlug)}` : `/stores/${encodeURIComponent(row.storeId)}`;
  return (
    <li
      className="stores-browse-insertion-card rounded-ui-rect border border-sam-border bg-sam-surface p-3 dark:border-sam-border dark:bg-[#242526]"
      data-composition-slot="future_ad_insertion"
      data-campaign-id={row.campaignId}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-xxs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {t("store_insertion_sponsored")}
        </span>
        <span className="sam-text-xxs text-sam-meta">{row.title}</span>
      </div>
      <Link href={href} className="flex gap-3">
        {row.imageUrl ?
          <SamarketThumbnail
            src={row.imageUrl}
            alt=""
            size={64}
            className="h-16 w-16 shrink-0 rounded-ui-rect"
            imageClassName="object-cover"
          />
        : null}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-sam-fg">{row.headline}</p>
          {row.bodyCopy ?
            <p className="mt-1 line-clamp-2 sam-text-helper text-sam-muted">{row.bodyCopy}</p>
          : null}
        </div>
      </Link>
    </li>
  );
}

export function StoreBrowseInsertionCouponCard({
  row,
  storeSlug,
}: {
  row: Extract<StoresBrowseInsertionMetaRow, { kind: "coupon" }>;
  storeSlug?: string | null;
}) {
  const { t } = useI18n();
  const href = storeSlug ? `/stores/${encodeURIComponent(storeSlug)}` : `/stores/${encodeURIComponent(row.storeId)}`;
  const discountLabel =
    row.discountType === "percent"
      ? `${row.discountValue}%`
      : formatMoneyPhp(row.discountValue);

  return (
    <li
      className="stores-browse-insertion-card rounded-ui-rect border border-signature/30 bg-sam-surface p-3 dark:bg-[#242526]"
      data-composition-slot="future_coupon_insertion"
      data-campaign-id={row.campaignId}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-signature/15 px-2 py-0.5 sam-text-xxs font-semibold text-signature">
          {t("store_badge_coupon")}
        </span>
        <span className="sam-text-xxs text-sam-meta">{row.title}</span>
      </div>
      <Link
        href={href}
        className="block"
        onClick={() => {
          writeStoreCheckoutCouponSession({ storeId: row.storeId, campaignId: row.campaignId });
        }}
      >
        <p className="text-sm font-semibold text-sam-fg">
          {t("store_insertion_coupon_discount", { discount: discountLabel })}
        </p>
        {row.minOrderAmount != null && row.minOrderAmount > 0 ?
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("store_insertion_coupon_min_order", {
              amount: formatMoneyPhp(row.minOrderAmount),
            })}
          </p>
        : null}
        {row.termsCopy ?
          <p className="mt-1 line-clamp-2 sam-text-xxs text-sam-meta">{row.termsCopy}</p>
        : null}
      </Link>
    </li>
  );
}
