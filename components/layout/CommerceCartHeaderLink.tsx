"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useCommerceCartHeaderLink } from "@/components/layout/use-commerce-cart-header-link";

/** `RegionBar`와 동일 — 현재 세션 사용자의 매장 장바구니로 이동(비어 있으면 `/stores`) */
export function CommerceCartHeaderLink() {
  const { t } = useI18n();
  const { cartHref, cartCount } = useCommerceCartHeaderLink();

  return (
    <Link
      href={cartHref}
      className="relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
      aria-label={cartCount > 0 ? t("nav_cart_aria") : t("nav_store_list_aria")}
    >
      <StoreCommerceCartStrokeIcon className="h-5 w-5" />
      {cartCount > 0 ? (
        <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      ) : null}
    </Link>
  );
}
