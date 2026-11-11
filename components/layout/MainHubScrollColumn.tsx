"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { notifyAppShellScrollRootsChanged } from "@/lib/layout/app-shell-scroll-root-registry";
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
  plain = false,
  children,
}: {
  className?: string;
  /**
   * 메신저 채팅방 — 허브와 같은 요소를 유지(목록↔방 이동 시 리마운트 방지)하되 스크롤은 방이 소유한다.
   * 스크롤 잠금·z-index 해제, `data-main-hub-scroll-body` 표식 없음.
   */
  roomHost?: boolean;
  /**
   * D1 (2026-11-11): 허브·방이 아닌 화면 — 예전 `div` 래퍼와 같은 클래스만(허브 표식·스크롤 클래스 없음).
   * 허브↔상세 이동에도 같은 요소 타입을 유지해 안쪽 허브 화면 보관대(`HubRetentionStack`)가 다시 만들어지지 않게 한다.
   */
  plain?: boolean;
  children: ReactNode;
}) {
  /** F 단계: 스크롤 후보가 생기거나(마운트)·표식이 바뀌거나(roomHost)·사라질 때 구독자에게 알린다 — 전역 DOM 관찰 대신 */
  useLayoutEffect(() => {
    notifyAppShellScrollRootsChanged();
    return () => notifyAppShellScrollRootsChanged();
  }, [roomHost, plain]);
  if (plain) {
    return <main className={className}>{children}</main>;
  }
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
