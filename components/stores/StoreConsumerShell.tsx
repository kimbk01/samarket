"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";
import {
  decodeSlugSegment,
  isStoreSlugOrderMenuRoot,
  shouldWrapStoreDetailSlideShell,
} from "@/lib/stores/store-consumer-route";
import { StoreDetailSlideShell } from "@/components/stores/detail/StoreDetailSlideShell";
import { StoreSlugStickyBar } from "@/components/stores/StoreSlugStickyBar";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

/**
 * 소비자용 `/stores/[slug]/*` — 오너(/owner/) 제외.
 * 메뉴 루트: SlideShell + 내부 헤더. cart/checkout/상품: SlideShell 없음(내부 스크롤).
 */
export function StoreConsumerShell({ slug, children }: { slug: string; children: ReactNode }) {
  const { t } = useI18n();
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
  if (isStoreCommerceCartCheckoutPath(path)) {
    return <>{children}</>;
  }

  if (shouldWrapStoreDetailSlideShell(pathname, slug)) {
    return (
      <StoreDetailSlideShell storeSlug={decodedSlug}>{children}</StoreDetailSlideShell>
    );
  }

  if (isStoreSlugOrderMenuRoot(pathname, decodedSlug)) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
        <StoreSlugStickyBar slug={slug} />
      </div>
      {children}
    </>
  );
}
