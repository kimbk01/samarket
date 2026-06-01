"use client";

import type { ReactNode } from "react";

/** browse 4단(2차 업종 칩) — 레이아웃 높이를 고정해 iOS/Android 관성 스크롤 흔들림을 막는다. */
export function StoresBrowseHeaderScrollCollapse({ children }: { children: ReactNode }) {
  return (
    <div data-stores-browse-subtopic-collapse data-collapsed="false">
      <div>{children}</div>
    </div>
  );
}
