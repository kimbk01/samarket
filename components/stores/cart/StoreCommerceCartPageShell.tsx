"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
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
  STORE_GLOBAL_CART_SCROLL_BODY_INNER_CLASS,
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
  scrollInnerClassName = STORE_CART_SCROLL_BODY_INNER_CLASS,
}: {
  /** 스와이프·뒤로 폴백용 매장 slug (`/stores/[slug]/cart`) */
  storeSlug?: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 클라 cart shell 페인트 완료 — `measure-cart-page-phases` hydration 구간 */
  hydrationMeasured?: boolean;
  /** 스크롤 본문 inner — `/stores/cart` 는 `STORE_GLOBAL_CART_SCROLL_BODY_INNER_CLASS` */
  scrollInnerClassName?: string;
}) {
  /**
   * 요청 메모 등 입력 — 폼 키보드 SSOT 소비 (KB-06). 공식 신설 없음:
   * 포커스 입력을 헤더·결제 바 사이 보이는 영역으로, 키보드 열림 시 결제 바 safe-bottom 0 (CSS).
   */
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, effectiveViewportBottom } = useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({
    scrollRootRef,
    stickyChromeRef: headerRef,
    effectiveViewportBottom,
  });

  useLayoutEffect(() => {
    if (!hydrationMeasured) return;
    markCartHydrationStage("hydrated_marker_set_ms");
    flushCartHydrationBreakdown();
  }, [hydrationMeasured]);

  const page = (
    <div
      data-store-commerce-cart-page
      data-samarket-cart-hydrated={hydrationMeasured ? "1" : undefined}
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className={`${STORE_CART_PAGE_ROOT_CLASS} delivery-ui`}
    >
      {header ? (
        <div ref={headerRef} className={STORE_CART_HEADER_CHROME_CLASS}>
          {header}
        </div>
      ) : null}
      <div
        ref={scrollRootRef}
        data-form-keyboard-scroll-root="1"
        data-store-cart-scroll={STORE_CART_SCROLL_BODY_DATA_ATTR}
        className={STORE_CART_SCROLL_BODY_CLASS}
      >
        <div className={scrollInnerClassName}>{children}</div>
      </div>
      {footer ? (
        <div data-form-keyboard-footer="1" className={STORE_CART_FOOTER_CHROME_CLASS}>
          {footer}
        </div>
      ) : null}
    </div>
  );

  const slug = storeSlug?.trim() ?? "";
  if (slug) {
    return <StoreCartSwipeBackShell storeSlug={slug}>{page}</StoreCartSwipeBackShell>;
  }
  return page;
}
