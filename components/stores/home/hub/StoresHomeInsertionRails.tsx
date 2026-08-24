"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import { writeStoreCheckoutCouponSession } from "@/lib/stores/store-checkout-coupon-session";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { formatMoneyPhp } from "@/lib/utils/format";

export function StoresHomeInsertionRails({ insertions }: { insertions: StoresHomeInsertionMeta }) {
  const { t } = useI18n();
  const { paidAds, coupons } = insertions;
  if (paidAds.length === 0 && coupons.length === 0) return null;

  return (
    <>
      {paidAds.length > 0 ?
        <StoresHomeSectionShell title={t("store_insertion_home_ads_title")}>
          <ul className="space-y-2" data-composition-slot="homePaidAdInsertion">
            {paidAds.map((ad) => (
              <li
                key={ad.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 dark:bg-[#242526]"
                data-campaign-id={ad.id}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-xxs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    {t("store_insertion_sponsored")}
                  </span>
                  <span className="sam-text-xxs text-sam-meta">{ad.title}</span>
                </div>
                <Link href={`/stores/${encodeURIComponent(ad.storeId)}`} className="flex gap-3">
                  {ad.imageUrl ?
                    <SamarketThumbnail
                      src={ad.imageUrl}
                      alt=""
                      size={56}
                      className="h-14 w-14 shrink-0 rounded-ui-rect"
                      imageClassName="object-cover"
                    />
                  : null}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-sam-fg">{ad.headline}</p>
                    {ad.bodyCopy ?
                      <p className="mt-1 line-clamp-2 sam-text-helper text-sam-muted">{ad.bodyCopy}</p>
                    : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </StoresHomeSectionShell>
      : null}

      {coupons.length > 0 ?
        <StoresHomeSectionShell title={t("store_insertion_home_coupons_title")}>
          <ul className="space-y-2" data-composition-slot="homeCouponInsertion">
            {coupons.map((coupon) => {
              const discountLabel =
                coupon.discountType === "percent"
                  ? `${coupon.discountValue}%`
                  : formatMoneyPhp(coupon.discountValue);
              return (
                <li
                  key={coupon.id}
                  className="rounded-ui-rect border border-signature/30 bg-sam-surface p-3 dark:bg-[#242526]"
                  data-campaign-id={coupon.id}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-signature/15 px-2 py-0.5 sam-text-xxs font-semibold text-signature">
                      {t("store_badge_coupon")}
                    </span>
                    <span className="sam-text-xxs text-sam-meta">{coupon.title}</span>
                  </div>
                  <Link
                    href={`/stores/${encodeURIComponent(coupon.storeId)}`}
                    className="block"
                    onClick={() => {
                      writeStoreCheckoutCouponSession({
                        storeId: coupon.storeId,
                        campaignId: coupon.id,
                      });
                    }}
                  >
                    <p className="text-sm font-semibold text-sam-fg">
                      {t("store_insertion_coupon_discount", { discount: discountLabel })}
                    </p>
                    {coupon.minOrderAmount != null && coupon.minOrderAmount > 0 ?
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {t("store_insertion_coupon_min_order", {
                          amount: formatMoneyPhp(coupon.minOrderAmount),
                        })}
                      </p>
                    : null}
                    {coupon.termsCopy ?
                      <p className="mt-1 line-clamp-2 sam-text-xxs text-sam-meta">{coupon.termsCopy}</p>
                    : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </StoresHomeSectionShell>
      : null}
    </>
  );
}
