"use client";

import type { ReactNode } from "react";
import { useOwnerMobileStackViewportLock } from "@/lib/business/use-owner-mobile-stack-viewport-lock";

/**
 * `/stores/owner/apply` — `isStoreOwnerAdminRoute` 가 메인 `<main>` 세로 스크롤을 막으므로
 * `BusinessAdminShell` 과 같이 문서 스크롤을 잠그고 내부 `overflow-y-auto` 만 스크롤한다.
 */
export function StoresOwnerApplyShell({ children }: { children: ReactNode }) {
  useOwnerMobileStackViewportLock(true);
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[var(--biz-app-bg)] supports-[height:100svh]:h-[100svh] supports-[height:100svh]:max-h-[100svh]">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        {children}
      </div>
    </div>
  );
}
