"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";

const PANEL_MS = 480;
const PANEL_EASE = "cubic-bezier(0.25,0.1,0.2,1)";
const PANEL_PUSH_WIDTH = "100vw";

const CommunityMessengerHome = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerHome").then((m) => m.CommunityMessengerHome),
  { ssr: false, loading: () => <div className="min-h-[200px] bg-sam-surface" aria-hidden /> }
);

/**
 * `/philife`·`/home`·`/market/…` 일 때: 헤더 **메신저** 아이콘은 URL 이동 대신 `section=chats` 셸을 **풀뷰포트**로 연다(하단 탭
 * `community-messenger` 풀 경로와 별개 UX). 옛 방식(본문만 200% 슬라이드)은 1·2단 `AppStickyHeader`
 * 아래에만 메신저가 잡혀 — `fixed inset-0` + `z` 상위로 **전체**를 덮어 “메신저만” 보이게 한다.
 */
export function PhilifeMessengerFromHeaderStack({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { isOpen, setIsOpen, setRequestClose } = usePhilifeHeaderMessengerStack();
  const [exiting, setExiting] = useState(false);
  const [enterDraw, setEnterDraw] = useState(false);
  const [domReady, setDomReady] = useState(false);
  const enterRaf = useRef<number | null>(null);
  const finishExit = useRef(false);
  const onPath = isMessengerFromHeaderStackSurface(pathname);

  const runClose = useCallback(() => {
    if (!isOpen) return;
    setExiting(true);
  }, [isOpen]);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!onPath) {
      setRequestClose(null);
      return;
    }
    setRequestClose(runClose);
    return () => setRequestClose(null);
  }, [onPath, setRequestClose, runClose]);

  useLayoutEffect(() => {
    if (!onPath) return;
    if (!isOpen) {
      setExiting(false);
      setEnterDraw(false);
      return;
    }
    setExiting(false);
    setEnterDraw(false);
    if (enterRaf.current != null) cancelAnimationFrame(enterRaf.current);
    enterRaf.current = requestAnimationFrame(() => {
      enterRaf.current = null;
      requestAnimationFrame(() => setEnterDraw(true));
    });
  }, [isOpen, onPath]);

  useEffect(() => {
    if (!exiting) {
      finishExit.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      if (finishExit.current) return;
      finishExit.current = true;
      setIsOpen(false);
      setExiting(false);
    }, PANEL_MS);
    return () => clearTimeout(id);
  }, [exiting, setIsOpen]);

  useEffect(() => {
    if (onPath) return;
    if (isOpen) setIsOpen(false);
  }, [onPath, isOpen, setIsOpen]);

  const lock = onPath && (isOpen || exiting);
  useEffect(() => {
    if (!lock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lock]);

  if (!onPath) {
    return <>{children}</>;
  }

  const panelX = (() => {
    if (exiting) return "translate3d(100%,0,0)";
    if (enterDraw) return "translate3d(0,0,0)";
    return "translate3d(100%,0,0)";
  })();
  const shellX = (() => {
    if (exiting) return "translate3d(0,0,0)";
    if (enterDraw) return `translate3d(calc(-1 * ${PANEL_PUSH_WIDTH}),0,0)`;
    return "translate3d(0,0,0)";
  })();

  const showPortal = (isOpen || exiting) && domReady && typeof document !== "undefined";

  const panel = showPortal
    ? createPortal(
        <div
          className="pointer-events-auto fixed inset-y-0 right-0 z-50 flex max-h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden bg-[color:var(--messenger-bg,#ffffff)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pt-[env(safe-area-inset-top,0px)] text-[color:var(--messenger-fg,#0f0f0f)] will-change-transform [overscroll-behavior:contain]"
          style={{
            transform: panelX,
            transition: `transform ${PANEL_MS}ms ${PANEL_EASE}`,
            width: PANEL_PUSH_WIDTH,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="메신저"
        >
          <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col">
            <CommunityMessengerHome initialSection="chats" fromPhilifeHeaderStack />
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        className="relative w-full min-w-0 min-h-0 flex-1 overflow-x-hidden transition-transform"
        style={{
          transform: shellX,
          transition: `transform ${PANEL_MS}ms ${PANEL_EASE}`,
          willChange: lock ? "transform" : undefined,
        }}
      >
        {children}
      </div>
      {panel}
    </>
  );
}
