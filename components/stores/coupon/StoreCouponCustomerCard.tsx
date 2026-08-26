"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";
import { formatMoneyPhp } from "@/lib/utils/format";

const CTA_PRIMARY =
  "mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect bg-signature px-3 text-sm font-medium text-white";
const CTA_OUTLINE =
  "mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-medium text-sam-fg";

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
  const { t } = useI18n();
  const storeHref = card.storeSlug ? `/stores/${encodeURIComponent(card.storeSlug)}` : "";
  const orderHref =
    card.redeemedOrderId
      ? `/mypage/store-orders/${encodeURIComponent(card.redeemedOrderId)}`
      : "";

  return (
    <article
      className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
      data-coupon-card="1"
      data-coupon-face="1"
      data-coupon-bucket={card.bucket}
      data-coupon-number={card.couponNumber ?? ""}
    >
      <div className="flex gap-3 p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect bg-sam-app" data-coupon-face-store-visual="1">
          {card.logoUrl ? (
            <SamarketThumbnail src={card.logoUrl} alt="" className="h-full w-full object-cover" size={56} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-sam-muted">Store</div>
          )}
        </div>
        <div className="min-w-0 flex-1" data-coupon-face-contract="1">
          <p className="truncate text-sm font-semibold text-sam-fg">{card.storeName || t("store_coupon_wallet_store_fallback")}</p>
          {card.menuPreviewTitles.length > 0 ? (
            <p className="mt-0.5 text-xs text-sam-muted">
              {t("store_coupon_representative_menu")}: {card.menuPreviewTitles.join(" · ")}
            </p>
          ) : null}
          <p className="mt-2 text-base font-bold text-signature">{card.benefitLabel}</p>
          <p className="mt-0.5 text-sm text-sam-fg">{card.title}</p>
          <p className="mt-1 text-xs text-sam-muted">{t(card.purposeKey)}</p>
          {card.minOrderPhp != null ? (
            <p className="text-xs text-sam-muted">
              {t("store_coupon_min_order")} {formatMoneyPhp(card.minOrderPhp)}
            </p>
          ) : null}
          {card.targetKey ? <p className="text-xs text-sam-muted">{t(card.targetKey)}</p> : null}
          {card.validUntilLabel ? (
            <p className="text-xs text-sam-muted">{t("store_coupon_wallet_valid_until", { date: card.validUntilLabel })}</p>
          ) : null}
          <p className="mt-1 text-xs text-sam-muted">{t(card.providerKey, { store: card.storeName })}</p>
          <p className="mt-1 text-xs font-medium text-sam-fg">
            {t("store_coupon_number_label")}:{" "}
            {card.couponNumber ?? t("store_coupon_number_legacy")}
          </p>
          <p className="mt-1 text-xs font-medium text-sam-fg">{t(card.walletStatusKey)}</p>
          {card.usedOnLabel ? (
            <p className="text-xs text-sam-muted">{t("store_coupon_wallet_used_on", { date: card.usedOnLabel })}</p>
          ) : null}
          {card.orderNo ? (
            <p className="text-xs text-sam-muted">{t("store_coupon_wallet_order", { orderNo: card.orderNo })}</p>
          ) : null}
        </div>
      </div>
      <div className="border-t border-sam-border px-3 pb-3">
        {detailState === "login" && loginHref ? (
          <Link href={loginHref} className={CTA_PRIMARY} data-store-coupon-detail-cta="login">
            {claimLabel ?? t("store_coupon_detail_login")}
          </Link>
        ) : detailState === "claim" && onClaim ? (
          <button type="button" className={CTA_PRIMARY} disabled={claimBusy} onClick={onClaim} data-store-coupon-detail-cta="claim">
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
          ) : (
            <p className="mt-2 text-center text-sm font-medium text-signature">{heldLabel ?? t("store_coupon_claimed")}</p>
          )
        ) : detailState === "unusable" ? (
          <p className="mt-2 text-center text-sm text-sam-muted">{unusableLabel ?? t("store_coupon_unusable")}</p>
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
          <Link className={CTA_OUTLINE} href={orderHref}>
            {t("store_coupon_wallet_view_order")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
