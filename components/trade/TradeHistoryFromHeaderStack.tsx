"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useTradeHeaderTradeHistoryStack } from "@/contexts/TradeHeaderTradeHistoryStackContext";
import { isTradeHistoryFromHeaderStackSurface } from "@/lib/layout/trade-history-from-header-stack-surface";
import { TradeHistoryStackPanel } from "@/components/trade/TradeHistoryStackPanel";

const PANEL_MS = 480;
const PANEL_EASE = "cubic-bezier(0.25,0.1,0.2,1)";
/** 뷰포트의 90% — `PEEK_STRIP_WIDTH` 와 합이 100vw 가 되도록 유지 */
const PANEL_WIDTH = "90vw";
const SHELL_PUSH_X = PANEL_WIDTH;
const PEEK_STRIP_WIDTH = "10vw";

/**
 * `/home`·`/market/…` 에서 헤더 `+` → 거래 내역을 **좌→우 슬라이드**로 연는다.
 * 패널은 뷰포트 **90%** 너비이고, 본문은 **90vw만** 오른쪽으로 밀려 **덮지 않고** 이전 페이지가 오른쪽 10% 띠로 남는다(포털 고정 패널 + transform 병행).
 */
export function TradeHistoryFromHeaderStack({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const { isOpen, setIsOpen, setRequestClose } = useTradeHeaderTradeHistoryStack();
  const [exiting, setExiting] = useState(false);
  const [enterDraw, setEnterDraw] = useState(false);
  const [domReady, setDomReady] = useState(false);
  const enterRaf = useRef<number | null>(null);
  const finishExit = useRef(false);
  const onPath = isTradeHistoryFromHeaderStackSurface(pathname);

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
    return () => window.clearTimeout(id);
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
    if (exiting) return "translate3d(-100%,0,0)";
    if (enterDraw) return "translate3d(0,0,0)";
    return "translate3d(-100%,0,0)";
  })();
  const shellX = (() => {
    if (exiting) return "translate3d(0,0,0)";
    if (enterDraw) return `translate3d(${SHELL_PUSH_X},0,0)`;
    return "translate3d(0,0,0)";
  })();

  const showPortal = (isOpen || exiting) && domReady && typeof document !== "undefined";

  const panel = showPortal
    ? createPortal(
        <>
          {!exiting ? (
            <button
              type="button"
              className="fixed inset-y-0 right-0 z-[50] max-w-[100vw] cursor-pointer touch-manipulation border-0 bg-transparent p-0 outline-none [overscroll-behavior:contain]"
              style={{ width: PEEK_STRIP_WIDTH, maxWidth: PEEK_STRIP_WIDTH }}
              aria-label={t("nav_trade_history_peek_dismiss")}
              onClick={() => runClose()}
            />
          ) : null}
          <div
            className="pointer-events-auto fixed inset-y-0 left-0 z-[51] flex max-h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-r border-sam-border bg-sam-app pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pt-0 text-sam-fg will-change-transform [overscroll-behavior:contain]"
            style={{
              transform: panelX,
              transition: `transform ${PANEL_MS}ms ${PANEL_EASE}`,
              width: PANEL_WIDTH,
              maxWidth: PANEL_WIDTH,
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t("nav_trade_history_title")}
          >
            <TradeHistoryStackPanel />
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <div
        className="relative min-h-0 min-w-0 w-full flex-1 overflow-x-hidden transition-transform"
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
