"use client";

import type { ReactNode } from "react";
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
  header,
  children,
  footer,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div data-store-commerce-cart-page className={STORE_CART_PAGE_ROOT_CLASS}>
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
}
