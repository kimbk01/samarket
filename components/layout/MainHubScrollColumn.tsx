"use client";

import type { ReactNode } from "react";
import {
  MAIN_HUB_SCROLL_BODY_CLASS,
  MAIN_HUB_SCROLL_HEADER_CLASS,
} from "@/lib/layout/main-hub-scroll-column";

/**
 * 허브 화면 전용 — 헤더(고정) + 본문 슬롯.
 * MAIN hub transition: Header는 `AppRouteTransition` surface 안 `hubChromeHeader` 로 이동.
 * 본 컴포넌트는 비-transition / 레거시 조합용으로 유지.
 */
export function MainHubScrollColumn({
  header,
  body,
}: {
  header: ReactNode;
  body: ReactNode;
}) {
  return (
    <>
      <div className={MAIN_HUB_SCROLL_HEADER_CLASS}>{header}</div>
      {body}
    </>
  );
}

/** 허브 본문 `<main>` — `ConditionalAppShell` 전용 */
export function MainHubScrollBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main data-main-hub-scroll-body className={`${MAIN_HUB_SCROLL_BODY_CLASS} ${className ?? ""}`}>
      {children}
    </main>
  );
}
