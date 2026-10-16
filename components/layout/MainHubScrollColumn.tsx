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
  roomHost = false,
  children,
}: {
  className?: string;
  /**
   * 메신저 채팅방 — 허브와 같은 요소를 유지(목록↔방 이동 시 리마운트 방지)하되 스크롤은 방이 소유한다.
   * 스크롤 잠금·z-index 해제, `data-main-hub-scroll-body` 표식 없음.
   */
  roomHost?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      data-main-hub-scroll-body={roomHost ? undefined : ""}
      data-main-hub-room-host={roomHost ? "" : undefined}
      className={`${MAIN_HUB_SCROLL_BODY_CLASS}${roomHost ? " main-hub-scroll-body--room-host" : ""} ${className ?? ""}`}
    >
      {children}
    </main>
  );
}
