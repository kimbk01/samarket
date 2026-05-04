"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
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

/** 메인 BottomNav(z-30)·메신저 허브 캡슐(z-40)보다 위, WebConnectivityBanner(z-100)보다 아래 */
const CALL_OVERLAY_PORTAL_Z = "z-[78]";

export function CallScreenShell({
  variant = "overlay",
  surfaceClassName =
    variant === "overlay" || variant === "dock-top" ? DEFAULT_OVERLAY_SURFACE : "bg-ui-page",
  children,
  className = "",
}: Props) {
  /** `useLayoutEffect`로 첫 페인트 전에 body 포털 부착(하단 탭과의 순간 역전 완화) */
  const [portalReady, setPortalReady] = useState(false);
  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  const base =
    variant === "overlay"
      ? `fixed inset-0 ${CALL_OVERLAY_PORTAL_Z} flex min-h-0 flex-col ${surfaceClassName}`
      : variant === "dock-top"
        ? `fixed inset-x-0 top-0 ${CALL_OVERLAY_PORTAL_Z} flex max-h-[min(520px,92dvh)] min-h-0 flex-col pt-[max(14px,calc(env(safe-area-inset-top,0px)+8px))] ${surfaceClassName}`
        : `flex h-full max-h-full min-h-0 min-h-[100dvh] flex-col overflow-hidden supports-[height:100svh]:min-h-[100svh] ${surfaceClassName}`;
  const shell = (
    <div data-messenger-shell data-call-screen-shell className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );

  if ((variant === "overlay" || variant === "dock-top") && portalReady && typeof document !== "undefined") {
    return createPortal(shell, document.body);
  }

  return shell;
}
