"use client";

import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import { StoreSlugStickyBar } from "@/components/stores/StoreSlugStickyBar";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { isStoreSlugOrderMenuRoot } from "@/lib/stores/store-consumer-route";

/**
 * 소비자용 `/stores/[slug]/*` — 오너(/owner/) 제외 시 매장별 1단 스티키(이름·액션) 고정.
 * 주문 메뉴 루트(`/stores/[slug]` 단일 세그먼트)는 Baemin형 전용 헤더가 페이지 내부에 있으므로 Tier1 바 생략.
 */
export function StoreConsumerShell({ slug, children }: { slug: string; children: ReactNode }) {
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
  if (isStoreSlugOrderMenuRoot(pathname, slug)) {
    return <>{children}</>;
  }
  const normalizedSlug = encodeURIComponent(decodeURIComponent((slug || "").trim()));
  const pathNoQuery = (pathname ?? "").split("?")[0] ?? "";
  /** 장바구니/체크아웃은 자체 헤더를 쓰거나(또는 헤더 없이) 풀스크린 구성 */
  if (
    pathNoQuery === `/stores/${normalizedSlug}/cart` ||
    pathNoQuery.startsWith(`/stores/${normalizedSlug}/cart/`) ||
    pathNoQuery === `/stores/${normalizedSlug}/checkout` ||
    pathNoQuery.startsWith(`/stores/${normalizedSlug}/checkout/`)
  ) {
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
