"use client";

import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import {
  flushCartHydrationBreakdown,
  markCartHydrationStage,
} from "@/lib/stores/cart-hydration-breakdown";
import { StoreCartSwipeBackShell } from "@/components/stores/cart/StoreCartSwipeBackShell";
import {
  STORE_CART_FOOTER_CHROME_CLASS,
  STORE_CART_HEADER_CHROME_CLASS,
  STORE_CART_PAGE_ROOT_CLASS,
  STORE_CART_SCROLL_BODY_CLASS,
  STORE_CART_SCROLL_BODY_INNER_CLASS,
  STORE_CART_SCROLL_BODY_DATA_ATTR,
} from "@/lib/stores/store-cart-page-layout";

/**
 * Store cart: pinned header/footer, scrollable middle (flex column).
 */
export function StoreCommerceCartPageShell({
  storeSlug,
  header,
  children,
  footer,
  hydrationMeasured,
}: {
  /** 스와이프·뒤로 폴백용 매장 slug (`/stores/[slug]/cart`) */
  storeSlug?: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 클라 cart shell 페인트 완료 — `measure-cart-page-phases` hydration 구간 */
  hydrationMeasured?: boolean;
}) {
  useLayoutEffect(() => {
    if (!hydrationMeasured) return;
    markCartHydrationStage("hydrated_marker_set_ms");
    flushCartHydrationBreakdown();
  }, [hydrationMeasured]);

  const page = (
    <div
      data-store-commerce-cart-page
      data-samarket-cart-hydrated={hydrationMeasured ? "1" : undefined}
      className={`${STORE_CART_PAGE_ROOT_CLASS} delivery-ui`}
    >
      {header ? <div className={STORE_CART_HEADER_CHROME_CLASS}>{header}</div> : null}
      <div
        data-store-cart-scroll={STORE_CART_SCROLL_BODY_DATA_ATTR}
        className={STORE_CART_SCROLL_BODY_CLASS}
      >
        <div className={STORE_CART_SCROLL_BODY_INNER_CLASS}>{children}</div>
      </div>
      {footer ? <div className={STORE_CART_FOOTER_CHROME_CLASS}>{footer}</div> : null}
    </div>
  );

  const slug = storeSlug?.trim() ?? "";
  if (slug) {
    return <StoreCartSwipeBackShell storeSlug={slug}>{page}</StoreCartSwipeBackShell>;
  }
  return page;
}
