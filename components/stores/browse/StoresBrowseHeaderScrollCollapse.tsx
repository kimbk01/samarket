"use client";

import type { ReactNode } from "react";
import { useStoresBrowseHeaderScrollHide } from "@/lib/stores/use-stores-browse-header-scroll-hide";

/** browse 4단(2차 업종 칩) — 레이아웃 높이를 고정해 iOS/Android 관성 스크롤 흔들림을 막는다. */
export function StoresBrowseHeaderScrollCollapse({ children }: { children: ReactNode }) {
  const collapsed = useStoresBrowseHeaderScrollHide();

  return (
    <div
      data-stores-browse-subtopic-collapse
      data-collapsed={collapsed ? "true" : "false"}
      aria-hidden={collapsed}
    >
      <div>{children}</div>
    </div>
  );
}
