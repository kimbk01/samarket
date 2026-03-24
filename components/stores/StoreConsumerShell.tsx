"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StoreSlugStickyBar } from "@/components/stores/StoreSlugStickyBar";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

/**
 * 소비자용 `/stores/[slug]/*` — 오너(/owner/) 제외 시 매장별 1단 스티키(이름·액션) 고정.
 * 다른 slug로 이동하면 이 레이아웃이 바뀌어 해당 매장 데이터로 다시 그려짐.
 */
export function StoreConsumerShell({ slug, children }: { slug: string; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.includes("/owner/")) {
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
