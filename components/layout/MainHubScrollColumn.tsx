"use client";

import type { ReactNode } from "react";
import {
  MAIN_HUB_SCROLL_BODY_CLASS,
  MAIN_HUB_SCROLL_HEADER_CLASS,
} from "@/lib/layout/main-hub-scroll-column";

/**
 * 허브 화면 전용 — 헤더(고정) + 본문(스크롤) 2단. `ConditionalAppShell` 에서만 사용.
 */
export function MainHubScrollColumn({
  header,
  mainClassName,
  children,
}: {
  header: ReactNode;
  mainClassName: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={MAIN_HUB_SCROLL_HEADER_CLASS}>{header}</div>
      <main data-main-hub-scroll-body className={`${MAIN_HUB_SCROLL_BODY_CLASS} ${mainClassName}`}>
        {children}
      </main>
    </>
  );
}
