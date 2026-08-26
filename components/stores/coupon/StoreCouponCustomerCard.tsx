"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";
import { formatMoneyPhp } from "@/lib/utils/format";

const CTA_PRIMARY =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect bg-signature px-3 text-sm font-medium text-white";
const CTA_OUTLINE =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-medium text-sam-fg";
const BADGE =
  "inline-flex max-w-full truncate rounded-ui-rect px-1.5 py-0.5 text-[11px] font-medium";

export function StoreCouponCustomerCard({
  card,
  onClaim,
  onUse,
  claimBusy,
  claimLabel,
  heldLabel,
  unusableLabel,
  detailState,
  loginHref,
  orderMenuHref,
}: {
  card: CustomerCouponCardView;
  onClaim?: () => void;
  /** Wallet / held: write Coupon Instance handoff before navigating to store */
  onUse?: () => void;
  claimBusy?: boolean;
  claimLabel?: string;
  heldLabel?: string;
  unusableLabel?: string;
  detailState?: "login" | "claim" | "held" | "unusable" | "hidden";
  loginHref?: string;
  orderMenuHref?: string;
}) {
  const { t, safeT } = useI18n();
  const storeHref = card.storeSlug ? `/stores/${encodeURIComponent(card.storeSlug)}` : "";
  const orderHref = card.redeemedOrderId
    ? `/mypage/store-orders/${encodeURIComponent(card.redeemedOrderId)}`
    : "";
  const storeName =
    card.storeName ||
    safeT("store_coupon_wallet_store_fallback", { fallbackKo: "매장", fallbackEn: "Store" });
  const displayTitle = card.titleIsCustomerOpaque
    ? safeT("store_coupon_face_title_fallback", {
        vars: { store: storeName },
        fallbackKo: `${storeName} 할인`,
        fallbackEn: `${storeName} discount`,
      })
    : card.title ||
      safeT("store_coupon_face_title_fallback", {
        vars: { store: storeName },
        fallbackKo: `${storeName} 할인`,
        fallbackEn: `${storeName} discount`,
      });
  const benefitHero = card.benefitLabel
    ? safeT("store_coupon_face_benefit", {
        vars: { amount: card.benefitLabel },
        fallbackKo: `${card.benefitLabel} 할인`,
        fallbackEn: `${card.benefitLabel} off`,
      })
    : "";
  const showNumber = Boolean(card.couponNumber?.trim()) && !card.couponNumberLegacy;
  const isExpiring = card.bucket === "expiring";

  return (
    <article
      className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
      data-coupon-card="1"
      data-coupon-face="1"
      data-coupon-bucket={card.bucket}
      data-coupon-number={showNumber ? card.couponNumber ?? "" : ""}
    >
      <div className="min-w-0 p-3" data-coupon-face-contract="1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 text-xl font-bold tabular-nums text-signature" data-coupon-face-benefit="1">
            {benefitHero}
          </p>
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1" data-coupon-face-badges="1">
          <span className={`${BADGE} bg-signature/15 text-signature`}>
            {safeT("store_coupon_face_badge_free", { fallbackKo: "무료쿠폰", fallbackEn: "Free coupon" })}
          </span>
          {isExpiring ? (
            <span className={`${BADGE} bg-sam-warning/20 text-sam-fg`} data-coupon-face-expiring="1">
              {t("store_coupon_wallet_status_expiring")}
            </span>
          ) : null}
          {card.bucket === "redeemed" ? (
            <span className={`${BADGE} bg-sam-app text-sam-muted`}>{t("store_coupon_wallet_status_redeemed")}</span>
          ) : null}
        </div>

        <div className="mt-3 flex min-w-0 gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-sam-fg" data-coupon-face-title="1">
              {displayTitle}
            </p>
            {card.minOrderPhp != null ? (
              <p className="mt-1 text-xs text-sam-muted">
                {t("store_coupon_min_order")} {formatMoneyPhp(card.minOrderPhp)}
              </p>
            ) : null}
            {card.validUntilLabel ? (
              <p className="text-xs text-sam-muted">
                {safeT("store_coupon_face_valid_until", {
                  vars: { date: card.validUntilLabel },
                  fallbackKo: `사용기한 ${card.validUntilLabel}까지`,
                  fallbackEn: `Valid until ${card.validUntilLabel}`,
                })}
              </p>
            ) : null}
            {card.targetKey ? <p className="text-xs text-sam-muted">{t(card.targetKey)}</p> : null}
            {card.usedOnLabel ? (
              <p className="mt-1 text-xs text-sam-muted">
                {t("store_coupon_wallet_used_on", { date: card.usedOnLabel })}
              </p>
            ) : null}
            {card.orderNo ? (
              <p className="text-xs text-sam-muted">{t("store_coupon_wallet_order", { orderNo: card.orderNo })}</p>
            ) : null}
            {showNumber ? (
              <p className="mt-2 text-xs font-medium text-sam-fg" data-coupon-face-number="1">
                {t("store_coupon_number_label")} {card.couponNumber}
              </p>
            ) : null}
          </div>
          <div
            className="h-16 w-16 shrink-0 overflow-hidden rounded-ui-rect bg-sam-app"
            data-coupon-face-store-visual="1"
          >
            {card.logoUrl ? (
              <SamarketThumbnail src={card.logoUrl} alt="" className="h-full w-full object-cover" size={64} />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-sam-muted">
                {storeName.slice(0, 8)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-sam-border px-3 py-3" data-coupon-face-footer="1">
        {detailState === "login" && loginHref ? (
          <Link href={loginHref} className={CTA_PRIMARY} data-store-coupon-detail-cta="login">
            {claimLabel ?? t("store_coupon_detail_login")}
          </Link>
        ) : detailState === "claim" && onClaim ? (
          <button
            type="button"
            className={CTA_PRIMARY}
            disabled={claimBusy}
            onClick={onClaim}
            data-store-coupon-detail-cta="claim"
          >
            {claimLabel ?? t("store_coupon_claim")}
          </button>
        ) : detailState === "held" ? (
          orderMenuHref ? (
            <a
              href={orderMenuHref}
              className={CTA_PRIMARY}
              data-store-coupon-detail-cta="order"
              onClick={() => onUse?.()}
            >
              {heldLabel ?? t("store_coupon_claimed")} · {t("store_coupon_order_cta")}
            </a>
          ) : storeHref ? (
            <Link className={CTA_PRIMARY} href={storeHref} onClick={() => onUse?.()} data-store-coupon-detail-cta="store">
              {safeT("store_coupon_face_go_store", {
                fallbackKo: "해당 매장 바로가기",
                fallbackEn: "Go to store",
              })}
            </Link>
          ) : (
            <p className="text-center text-sm font-medium text-signature">{heldLabel ?? t("store_coupon_claimed")}</p>
          )
        ) : detailState === "unusable" ? (
          <p className="text-center text-sm text-sam-muted">{unusableLabel ?? t("store_coupon_unusable")}</p>
        ) : card.cta === "use" && storeHref ? (
          <Link
            className={CTA_PRIMARY}
            href={storeHref}
            onClick={() => onUse?.()}
            data-store-coupon-wallet-cta="use"
          >
            {t("store_coupon_use_this")}
          </Link>
        ) : card.cta === "view_order" && orderHref ? (
          <Link className={CTA_OUTLINE} href={orderHref} data-store-coupon-wallet-cta="view_order">
            {t("store_coupon_wallet_view_order")}
          </Link>
        ) : storeHref && card.bucket !== "redeemed" ? (
          <Link className={CTA_OUTLINE} href={storeHref}>
            {safeT("store_coupon_face_go_store", {
              fallbackKo: "해당 매장 바로가기",
              fallbackEn: "Go to store",
            })}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
