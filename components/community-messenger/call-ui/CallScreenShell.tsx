"use client";

import type { ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
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
const CALL_VIEWPORT_MIN_HEIGHT_PX = 240;
const CALL_VIEWPORT_CSS_VARS = ["--call-viewport-height", "--call-safe-bottom"] as const;

function readSafeAreaInsetBottomPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:-9999px;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);";
  document.body.appendChild(el);
  const pb = parseFloat(getComputedStyle(el).paddingBottom || "0") || 0;
  document.body.removeChild(el);
  return Math.round(pb);
}

function useCallViewportResize(enabled: boolean, shellRef: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    let safeBottomPx = readSafeAreaInsetBottomPx();
    let syncRafId = 0;
    let orientationFallbackId: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      const vv = window.visualViewport;
      const visibleHeight = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const heightPx = Math.max(CALL_VIEWPORT_MIN_HEIGHT_PX, Math.round(visibleHeight));
      shell.style.setProperty("--call-viewport-height", `${heightPx}px`);
      shell.style.setProperty("--call-safe-bottom", `${safeBottomPx}px`);
    };
    const scheduleSync = () => {
      cancelAnimationFrame(syncRafId);
      syncRafId = requestAnimationFrame(() => {
        syncRafId = 0;
        sync();
      });
    };
    const onResize = () => scheduleSync();
    const onOrientation = () => {
      if (orientationFallbackId != null) clearTimeout(orientationFallbackId);
      const handlePostOrientationResize = () => {
        window.removeEventListener("resize", handlePostOrientationResize);
        if (orientationFallbackId != null) {
          clearTimeout(orientationFallbackId);
          orientationFallbackId = null;
        }
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      };
      window.addEventListener("resize", handlePostOrientationResize, { once: true });
      orientationFallbackId = setTimeout(() => {
        window.removeEventListener("resize", handlePostOrientationResize);
        orientationFallbackId = null;
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      }, 220);
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      cancelAnimationFrame(syncRafId);
      if (orientationFallbackId != null) clearTimeout(orientationFallbackId);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      for (const key of CALL_VIEWPORT_CSS_VARS) {
        shell.style.removeProperty(key);
      }
    };
  }, [enabled, shellRef]);
}

export function CallScreenShell({
  variant = "overlay",
  surfaceClassName =
    variant === "overlay" || variant === "dock-top" ? DEFAULT_OVERLAY_SURFACE : "bg-ui-page",
  children,
  className = "",
}: Props) {
  /** `useLayoutEffect`로 첫 페인트 전에 body 포털 부착(하단 탭과의 순간 역전 완화) */
  const [portalReady, setPortalReady] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);
  const viewportResizeEnabled = variant === "overlay" ? portalReady : variant === "page";
  useCallViewportResize(viewportResizeEnabled, shellRef);

  const base =
    variant === "overlay"
      ? `fixed inset-x-0 top-0 ${CALL_OVERLAY_PORTAL_Z} flex h-[var(--call-viewport-height,100dvh)] max-h-[var(--call-viewport-height,100dvh)] min-h-0 flex-col ${surfaceClassName}`
      : variant === "dock-top"
        ? `fixed inset-x-0 top-0 ${CALL_OVERLAY_PORTAL_Z} flex max-h-[min(520px,92dvh)] min-h-0 flex-col pt-[max(14px,calc(env(safe-area-inset-top,0px)+8px))] ${surfaceClassName}`
        : `flex h-[var(--call-viewport-height,100dvh)] max-h-[var(--call-viewport-height,100dvh)] min-h-0 flex-col overflow-hidden ${surfaceClassName}`;
  const shell = (
    <div ref={shellRef} data-messenger-shell data-call-screen-shell className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );

  if ((variant === "overlay" || variant === "dock-top") && portalReady && typeof document !== "undefined") {
    return createPortal(shell, document.body);
  }

  return shell;
}
