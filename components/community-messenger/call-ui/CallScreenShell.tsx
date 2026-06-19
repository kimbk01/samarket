"use client";

import type { ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";
import { resolveLayoutVisibleViewportCssPx } from "@/lib/ui/layout-visible-viewport-px";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";

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

/** 메인 BottomNav(`z-index:1200`)·FAB 위 — 전역 모달(1310+) 아래 */
const CALL_OVERLAY_PORTAL_Z = "z-[1280]";
const CALL_VIEWPORT_MIN_HEIGHT_PX = 240;
const CALL_VIEWPORT_CSS_VARS = ["--call-viewport-height", "--call-safe-bottom"] as const;

function readSafeAreaInsetBottomPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:-9999px;bottom:0;visibility:hidden;padding-bottom:var(--safe-bottom);";
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
    let orientationRafId = 0;

    const sync = () => {
      const heightPx = resolveLayoutVisibleViewportCssPx(CALL_VIEWPORT_MIN_HEIGHT_PX);
      shell.style.setProperty("--call-viewport-height", `${heightPx}px`);
      shell.style.setProperty("--call-safe-bottom", `${safeBottomPx}px`);
      /** `fixed top+height` 만 쓰면 모바일에서 셸 아래 앱 배경이 비친다 — 실측 높이를 인라인으로도 고정 */
      shell.style.height = `${heightPx}px`;
      shell.style.minHeight = `${heightPx}px`;
      shell.style.maxHeight = `${heightPx}px`;
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
      const handlePostOrientationResize = () => {
        cancelAnimationFrame(orientationRafId);
        window.removeEventListener("resize", handlePostOrientationResize);
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      };
      window.addEventListener("resize", handlePostOrientationResize, { once: true });
      cancelAnimationFrame(orientationRafId);
      orientationRafId = window.setTimeout(() => {
        window.removeEventListener("resize", handlePostOrientationResize);
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      }, 200) as unknown as number;
    };

    sync();
    let bootRaf1 = 0;
    let bootRaf2 = 0;
    bootRaf1 = requestAnimationFrame(() => {
      bootRaf2 = requestAnimationFrame(() => {
        sync();
      });
    });

    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    const unsubShell = subscribeSamarketShellKeyboardInsets(() => {
      sync();
    });

    return () => {
      cancelAnimationFrame(syncRafId);
      cancelAnimationFrame(bootRaf1);
      cancelAnimationFrame(bootRaf2);
      clearTimeout(orientationRafId);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      unsubShell();
      shell.style.height = "";
      shell.style.minHeight = "";
      shell.style.maxHeight = "";
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
  /** `useLayoutEffect`로 첫 페인트 전에 body 포털 부착 */
  const [portalReady, setPortalReady] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);
  const viewportResizeEnabled = variant === "overlay" || variant === "page";
  useCallViewportResize(viewportResizeEnabled, shellRef);

  const base =
    variant === "overlay"
      ? `fixed inset-x-0 top-0 ${CALL_OVERLAY_PORTAL_Z} flex h-[var(--call-viewport-height,100dvh)] max-h-[var(--call-viewport-height,100dvh)] min-h-0 flex-col overflow-hidden ${surfaceClassName}`
      : variant === "dock-top"
        ? `fixed inset-x-0 top-0 ${CALL_OVERLAY_PORTAL_Z} flex max-h-[min(520px,92dvh)] min-h-0 flex-col overflow-hidden pt-[max(14px,calc(var(--safe-top)+8px))] ${surfaceClassName}`
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
