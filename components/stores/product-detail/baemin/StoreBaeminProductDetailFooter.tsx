"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCommerceBottomActionShell } from "@/components/stores/commerce/StoreCommerceBottomActionShell";
import {
  STORE_COMMERCE_ACTION_CAPTION_CLASS,
  STORE_COMMERCE_ACTION_HINT_AMBER_CLASS,
  STORE_COMMERCE_ACTION_PRIMARY_TEXT_CLASS,
  STORE_COMMERCE_ACTION_SECONDARY_TEXT_CLASS,
  STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS,
  storeCommerceActionRowClass,
  storeCommerceActionSideCtaClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";
import { formatMoneyPhp } from "@/lib/utils/format";

function storeMinOrderGapPhp(
  minOrderPhp: number | null,
  cartTotalPhp: number,
  deliveryAvailable: boolean
): number {
  if (
    !deliveryAvailable ||
    minOrderPhp == null ||
    minOrderPhp <= 0 ||
    cartTotalPhp <= 0 ||
    cartTotalPhp >= minOrderPhp
  ) {
    return 0;
  }
  return Math.max(0, Math.ceil(minOrderPhp - cartTotalPhp));
}

/**
 * 상품 상세 하단 — 배민 참고: 좌 최소주문·카트 소계 / 우 `{금액} 담기`
 * 비활성: 필수 옵션 미선택·품절·영업중단·`!commerceCart` (`StoreProductPublic` `ctaDisabled`)
 */
export function StoreBaeminProductDetailFooter({
  lineTotalPhp,
  minOrderPhp,
  cartTotalPhp,
  deliveryAvailable,
  disabled,
  busy,
  errorMessage,
  onAdd,
}: {
  lineTotalPhp: number;
  minOrderPhp: number | null;
  cartTotalPhp: number;
  deliveryAvailable: boolean;
  disabled: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  onAdd: () => void;
}) {
  const { t } = useI18n();

  const totalLabel = formatMoneyPhp(Math.max(0, Math.floor(lineTotalPhp) || 0));
  const minPhp = minOrderPhp != null && minOrderPhp > 0 ? minOrderPhp : null;
  const minNeed = storeMinOrderGapPhp(minPhp, cartTotalPhp, deliveryAvailable);
  const ctaDisabled = disabled || Boolean(busy);
  const cartTotal = Math.max(0, Math.floor(cartTotalPhp) || 0);

  return (
    <StoreCommerceBottomActionShell
      variant="product-add"
      dataAttribute="data-store-product-detail-cta"
      errorMessage={errorMessage}
    >
      <div className={storeCommerceActionRowClass("product-add")}>
        <div className="min-w-0 flex-1 pb-0.5">
          {minPhp != null ? (
            <>
              <p className={STORE_COMMERCE_ACTION_CAPTION_CLASS}>
                {t("store_product_delivery_min_order_heading")}
              </p>
              <p className={`mt-0.5 ${STORE_COMMERCE_ACTION_PRIMARY_TEXT_CLASS}`}>
                {formatMoneyPhp(minPhp)}
              </p>
              {cartTotal > 0 ? (
                <p className={`mt-1 ${STORE_COMMERCE_ACTION_SECONDARY_TEXT_CLASS}`}>
                  {t("store_product_cart_subtotal_line", { amount: formatMoneyPhp(cartTotal) })}
                </p>
              ) : null}
              {minNeed > 0 ? (
                <p className={STORE_COMMERCE_ACTION_HINT_AMBER_CLASS}>
                  {t("store_bottom_min_order_remaining", { amount: formatMoneyPhp(minNeed) })}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className={STORE_COMMERCE_ACTION_CAPTION_CLASS}>
                {t("store_product_line_amount_heading")}
              </p>
              <p className={`mt-0.5 ${STORE_COMMERCE_ACTION_PRIMARY_TEXT_CLASS}`}>{totalLabel}</p>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={ctaDisabled}
          aria-busy={busy}
          onClick={(e) => {
            if (busy || ctaDisabled) {
              e.preventDefault();
              return;
            }
            onAdd();
          }}
          /* 담는 중(busy)에도 브랜드색 유지 — 스피너만 표시 */
          className={storeCommerceActionSideCtaClass(disabled)}
          aria-label={t("store_add_to_cart_amount_aria", { amount: totalLabel })}
        >
          {/* WP7 — 담는 중에는 버튼 자리 그대로 안에서 스피너 */}
          {busy ? (
            <span
              className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
              data-store-product-add-spinner="1"
              aria-hidden
            />
          ) : (
            <span className={STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS}>
              {t("store_add_to_cart_with_amount", { amount: totalLabel })}
            </span>
          )}
          {busy ? <span className="sr-only">{t("common_processing")}</span> : null}
        </button>
      </div>
    </StoreCommerceBottomActionShell>
  );
}
