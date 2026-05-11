"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { AppBackIcon } from "@/components/navigation/AppBackButton";
import { useOwnerHubDashboardPanel } from "@/components/business/owner/owner-hub-dashboard-panel-context";
import { OWNER_HUB_DASHBOARD_SLIDE_MS } from "@/components/business/owner/owner-hub-dashboard-slide-ms";

/**
 * 운영 대시보드 Slide Push (허브 `OwnerHubShell` 의 translateX 와 동일 ms·타이밍)
 * - 열림: 허브 전체 translateX(-100%) + 패널 translateX(100%→0) 동시 (우→좌로 들어와 기존 화면을 밂)
 * - 닫힘: 허브 0% 복귀 + 패널 translateX(0→100%) (좌→우로 빠짐)
 */
export function OwnerHubDashboardExpandable({ children }: { children: React.ReactNode }) {
  const panel = useOwnerHubDashboardPanel();
  const backBtnRef = useRef<HTMLButtonElement>(null);
  /** 진입 transition 이 반드시 잡히도록 DOM 기준선 측정 */
  const slidePanelRef = useRef<HTMLDivElement>(null);

  const [overlayMounted, setOverlayMounted] = useState(() => panel?.dashboardOpen ?? false);
  const [slideIn, setSlideIn] = useState(false);

  const exitRequestedRef = useRef(false);
  const pendingUrlCloseRef = useRef(false);
  const exitDoneRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const dashboardOpen = panel?.dashboardOpen ?? false;
  const closeDashboard = panel?.closeDashboard;
  const setHubPushPercent = panel?.setHubPushPercent;

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearExitTimer();
  }, [clearExitTimer]);

  const finalizeExit = useCallback(() => {
    if (exitDoneRef.current) return;
    exitDoneRef.current = true;
    clearExitTimer();

    const needCloseUrl = pendingUrlCloseRef.current;
    pendingUrlCloseRef.current = false;
    exitRequestedRef.current = false;

    setHubPushPercent?.(0);

    if (needCloseUrl && closeDashboard) {
      closeDashboard();
    }

    setOverlayMounted(false);
    setSlideIn(false);
  }, [clearExitTimer, closeDashboard, setHubPushPercent]);

  const scheduleExitFallbackTimer = useCallback(() => {
    clearExitTimer();
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      finalizeExit();
    }, OWNER_HUB_DASHBOARD_SLIDE_MS);
  }, [clearExitTimer, finalizeExit]);

  /**
   * 열림: 허브 0→-100% + 패널 100%→0 동시.
   * 포털이 페인트에 포함된 뒤(reflow로 translate-x-full 확정) 진입만 transition 적용.
   */
  useLayoutEffect(() => {
    if (!dashboardOpen) return;
    clearExitTimer();
    exitDoneRef.current = false;
    setOverlayMounted(true);
    exitRequestedRef.current = false;
    pendingUrlCloseRef.current = false;
    setHubPushPercent?.(0);
    setSlideIn(false);

    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        raf3 = window.requestAnimationFrame(() => {
          void slidePanelRef.current?.offsetWidth;
          setSlideIn(true);
          setHubPushPercent?.(-100);
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.cancelAnimationFrame(raf3);
    };
  }, [dashboardOpen, clearExitTimer, setHubPushPercent]);

  /** 브라우저 뒤로가기: URL 만 닫힘 → 허브 복귀 + 패널 우측 퇴장 동시 */
  useEffect(() => {
    if (dashboardOpen || !overlayMounted || !slideIn) return;
    exitRequestedRef.current = true;
    pendingUrlCloseRef.current = false;
    setHubPushPercent?.(0);
    setSlideIn(false);
    scheduleExitFallbackTimer();
  }, [dashboardOpen, overlayMounted, slideIn, scheduleExitFallbackTimer, setHubPushPercent]);

  useEffect(() => {
    if (!overlayMounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [overlayMounted]);

  useEffect(() => {
    if (!overlayMounted || !slideIn) return;
    window.requestAnimationFrame(() => {
      backBtnRef.current?.focus();
    });
  }, [overlayMounted, slideIn]);

  const onSlideTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "transform") return;
    if (e.target !== e.currentTarget) return;
    if (!exitRequestedRef.current) return;
    finalizeExit();
  };

  const handleBackClose = () => {
    if (!slideIn || exitDoneRef.current) return;
    pendingUrlCloseRef.current = true;
    exitRequestedRef.current = true;
    setHubPushPercent?.(0);
    setSlideIn(false);
    scheduleExitFallbackTimer();
  };

  if (!panel) {
    return <>{children}</>;
  }

  const { openDashboard } = panel;

  return (
    <>
      {!dashboardOpen && !overlayMounted ? (
        <button
          type="button"
          onClick={openDashboard}
          className="flex w-full items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-left shadow-sm transition-colors hover:bg-sam-app"
        >
          <span className="min-w-0">
            <span className="block sam-text-body font-semibold text-sam-fg">운영 대시보드</span>
            <span className="mt-0.5 block sam-text-xxs text-sam-muted">지표·주문·문의 요약을 펼쳐 보세요</span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-sam-muted" strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {overlayMounted ? (
        <BodyPortal>
          <div
            ref={slidePanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-hub-dash-panel-title"
            className={`fixed inset-y-0 right-0 z-[100] flex w-full max-w-[100vw] max-h-[100dvh] flex-col bg-sam-app shadow-[0_0_40px_rgba(0,0,0,0.12)] will-change-transform ${
              slideIn ? "translate-x-0" : "translate-x-full"
            }`}
            style={{
              transitionProperty: "transform",
              transitionDuration: `${OWNER_HUB_DASHBOARD_SLIDE_MS}ms`,
              transitionTimingFunction: slideIn
                ? "cubic-bezier(0.32, 0.72, 0, 1)"
                : "cubic-bezier(0.4, 0, 1, 1)",
            }}
            onTransitionEnd={onSlideTransitionEnd}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-sam-border px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-3">
              <button
                ref={backBtnRef}
                type="button"
                onClick={handleBackClose}
                className="sam-header-action flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
                aria-label="뒤로가기"
              >
                <AppBackIcon className="h-6 w-6" />
              </button>
              <h2
                id="owner-hub-dash-panel-title"
                className="min-w-0 flex-1 truncate text-center sam-text-body-lg font-semibold text-sam-fg"
              >
                운영 대시보드
              </h2>
              <div className="h-10 w-10 shrink-0" aria-hidden />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-2">
              {children}
            </div>
          </div>
        </BodyPortal>
      ) : null}
    </>
  );
}
