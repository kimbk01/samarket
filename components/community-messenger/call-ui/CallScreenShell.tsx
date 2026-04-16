"use client";

import type { ReactNode } from "react";
import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";

type Props = {
  /** 전체 화면 오버레이(수신·진행 통화 등) · 채팅방 상단 도킹 */
  variant?: "overlay" | "page" | "dock-top";
  /** 오버레이 기본은 메신저 보라 그라데이션, 페이지 기본은 `bg-ui-page` */
  surfaceClassName?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 통화 풀스크린 레이아웃 — safe-area, 배경만 통일. 내용은 자식에서 구성.
 */
export { MESSENGER_CALL_GRADIENT_SURFACE };

const DEFAULT_OVERLAY_SURFACE = MESSENGER_CALL_GRADIENT_SURFACE;

export function CallScreenShell({
  variant = "overlay",
  surfaceClassName =
    variant === "overlay" || variant === "dock-top" ? DEFAULT_OVERLAY_SURFACE : "bg-ui-page",
  children,
  className = "",
}: Props) {
  const base =
    variant === "overlay"
      ? `fixed inset-0 z-[60] flex min-h-0 flex-col ${surfaceClassName}`
      : variant === "dock-top"
        ? `fixed inset-x-0 top-0 z-[60] flex max-h-[min(520px,92dvh)] min-h-0 flex-col pt-[max(14px,calc(env(safe-area-inset-top,0px)+8px))] ${surfaceClassName}`
        : `flex min-h-0 min-h-[100dvh] flex-col ${surfaceClassName}`;
  return (
    <div data-messenger-shell className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );
}
