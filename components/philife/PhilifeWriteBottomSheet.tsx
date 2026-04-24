"use client";

import { useLayoutEffect, useState, useCallback, useEffect, useRef } from "react";
import { PhilifeNeighborhoodWriteForm } from "@/components/philife/PhilifeNeighborhoodWriteForm";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";

const SHEET_EXIT_MS = 520;

/**
 * `/philife` 1단(+): 글쓰기 폼을 **스티키 헤더(h1 스택) 바로 아래 ~ 화면 하단**으로
 * **아래→위**로 올리며 표시한다. 닫을 때 **아래로** 내려가며 사라진다.
 */
export function PhilifeWriteBottomSheet() {
  const { isOpen, openEpoch, initialCategory, close } = usePhilifeWriteSheet();
  const [topOffsetPx, setTopOffsetPx] = useState(0);
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const enterRafRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const exitInFlightRef = useRef(false);

  const measure = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    if (el) {
      setTopOffsetPx(Math.max(0, Math.round(el.getBoundingClientRect().bottom)));
    }
  }, []);

  useLayoutEffect(() => {
    if (enterRafRef.current != null) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = null;
    }
    if (!isOpen) {
      setEnterDraw(false);
      setIsExiting(false);
      return;
    }
    setIsExiting(false);
    measure();
    setEnterDraw(false);
    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = null;
      setEnterDraw(true);
      measure();
    });
    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (el && ro) ro.observe(el);
    return () => {
      if (enterRafRef.current != null) {
        cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      ro?.disconnect();
    };
  }, [isOpen, measure, openEpoch]);

  const lockBody = isOpen;
  useEffect(() => {
    if (!lockBody) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockBody]);

  const exitAndClose = useCallback((): Promise<void> => {
    if (exitInFlightRef.current) {
      return Promise.resolve();
    }
    exitInFlightRef.current = true;
    return new Promise((resolve) => {
      setIsExiting(true);
      const el = panelRef.current;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        exitInFlightRef.current = false;
        close();
        resolve();
      };
      if (!el) {
        setTimeout(finish, 0);
        return;
      }
      const safety = window.setTimeout(finish, SHEET_EXIT_MS + 100);
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== el) return;
        if (e.propertyName !== "transform") return;
        clearTimeout(safety);
        el.removeEventListener("transitionend", onEnd);
        finish();
      };
      requestAnimationFrame(() => {
        el.addEventListener("transitionend", onEnd, { once: true });
      });
    });
  }, [close]);

  if (!isOpen) return null;

  const panelOpen = enterDraw && !isExiting;
  const sheetTitle =
    initialCategory.trim() === "meetup" ? "모임 만들기" : "커뮤니티 글쓰기";

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-[50] flex flex-col"
      style={{ top: topOffsetPx, bottom: 0 }}
      role="dialog"
      aria-modal
      aria-label={sheetTitle}
    >
      <div
        ref={panelRef}
        className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-t border-sam-border bg-sam-app text-sam-fg transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
          panelOpen ? "translate-y-0 shadow-[0_-1px_0_0_rgba(15,23,42,0.06)]" : "translate-y-full shadow-none"
        }`}
      >
        <div className="shrink-0 border-b border-sam-border bg-sam-surface/95 px-3 py-2.5">
          <h2 className="text-center text-[16px] font-bold leading-tight text-sam-fg">{sheetTitle}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PhilifeNeighborhoodWriteForm
            key={openEpoch}
            initialCategory={initialCategory}
            suppressWriteScreenTier1
            onSheetExitBeforeNavigate={exitAndClose}
            onSheetClose={exitAndClose}
          />
        </div>
      </div>
    </div>
  );
}
