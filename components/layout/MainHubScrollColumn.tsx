"use client";

import type { ReactNode } from "react";
import {
  MAIN_HUB_SCROLL_BODY_CLASS,
  MAIN_HUB_SCROLL_HEADER_CLASS,
} from "@/lib/layout/main-hub-scroll-column";

/**
 * 허브 화면 전용 — 헤더(고정) + 본문 슬롯.
 * push 전환(`MainShellTabContentTransition`)은 `body` 안에서 `MainHubScrollBody` 와 함께 구성한다.
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
