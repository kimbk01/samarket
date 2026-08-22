"use client";

import type { ReactNode } from "react";
import { useBrowseSubtopicCollapsed } from "@/lib/stores/use-browse-subtopic-collapsed";

/** browse 3단(1차 업종 탭) — sentinel+IO 모듈 store 가 높이 접힘을 제어한다. */
export function StoresBrowseHeaderScrollCollapse({ children }: { children: ReactNode }) {
  const collapsed = useBrowseSubtopicCollapsed();

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
