"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { DeliveryStoreProductChildCommit } from "@/components/navigation/DeliveryStoreProductChildCommit";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";
import {
  decodeSlugSegment,
  isStoreProductDetailConsumerPath,
  isStoreSlugOrderMenuRoot,
  shouldWrapStoreDetailSlideShell,
} from "@/lib/stores/store-consumer-route";
import { StoreDetailSlideShell } from "@/components/stores/detail/StoreDetailSlideShell";
import { StoreSlugStickyBar } from "@/components/stores/StoreSlugStickyBar";

/**
 * 소비자용 `/stores/[slug]/*` — 오너(/owner/) 제외.
 * 메뉴 루트: SlideShell + 내부 헤더. cart/checkout/상품: SlideShell 없음(내부 스크롤).
 * CUT 2B: DeliveryStoreProductChildCommit — store route commit 후 product child push.
 */
export function StoreConsumerShell({ slug, children }: { slug: string; children: ReactNode }) {
  useI18n();
  const pathname = usePathname();
  const decodedSlug = decodeSlugSegment(slug);

  useLayoutEffect(() => {
    const path = (pathname ?? "").split("?")[0] ?? "";
    if (!isStoreConsumerDetailPath(path) || !decodedSlug) return;
    deliveryShellEntryMark("route_layout_enter", { slug: decodedSlug });
  }, [pathname, decodedSlug]);

  if (pathname?.includes("/owner/")) {
    return <>{children}</>;
  }

  const path = (pathname ?? "").split("?")[0] ?? "";
  const childCommit = decodedSlug ? (
    <DeliveryStoreProductChildCommit storeSlug={decodedSlug} />
  ) : null;

  if (isStoreCommerceCartCheckoutPath(path)) {
    return (
      <>
        {childCommit}
        {children}
      </>
    );
  }

  if (isStoreProductDetailConsumerPath(path)) {
    return (
      <>
        {childCommit}
        {children}
      </>
    );
  }

  if (shouldWrapStoreDetailSlideShell(pathname, slug)) {
    return (
      <>
        {childCommit}
        <StoreDetailSlideShell>{children}</StoreDetailSlideShell>
      </>
    );
  }

  if (isStoreSlugOrderMenuRoot(pathname, decodedSlug)) {
    return (
      <>
        {childCommit}
        {children}
      </>
    );
  }

  return (
    <>
      {childCommit}
      <div className="relative w-full min-w-0 max-w-full shrink-0">
        <StoreSlugStickyBar slug={slug} />
      </div>
      {children}
    </>
  );
}
