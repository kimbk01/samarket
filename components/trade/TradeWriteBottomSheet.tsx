"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/types/category";
import { WriteSheetFlowInner } from "@/components/write/WriteSheetFlowInner";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";

const SHEET_EXIT_MS = 520;

/**
 * `/home`·`/market/…` — 거래 글쓰기를 `PhilifeWriteBottomSheet` 와 동일한 스티키 헤더錨·슬라이드로 표시.
 */
export function TradeWriteBottomSheet() {
  const router = useRouter();
  const pathname = usePathname() ?? "/home";
  const { isOpen, openEpoch, close, setBlockingDraft, blockingDraft } = useTradeWriteSheet();
  const [topOffsetPx, setTopOffsetPx] = useState(0);
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [sheetCategoryKey, setSheetCategoryKey] = useState("");
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
    /** 거래 시트는 항상 빈 카테고리로 시작 — 마켓 URL 등으로 특정 주제가 고정되지 않게 */
    setSheetCategoryKey("");
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

  const onSuccessNavigate = useCallback(
    (category: CategoryWithSettings, _postId: string) => {
      void (async () => {
        await exitAndClose();
        router.replace(getCategoryHref(category));
      })();
    },
    [exitAndClose, router]
  );

  const onHeaderClose = useCallback(() => {
    if (blockingDraft) {
      const ok = window.confirm("작성 중인 내용이 저장되지 않습니다. 닫을까요?");
      if (!ok) return;
    }
    void exitAndClose();
  }, [blockingDraft, exitAndClose]);

  if (!isOpen) return null;

  const panelOpen = enterDraw && !isExiting;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-[50] flex flex-col"
      style={{ top: topOffsetPx, bottom: 0 }}
      role="dialog"
      aria-modal
      aria-label="거래 글쓰기"
    >
      <div
        ref={panelRef}
        className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-t border-sam-border bg-sam-app text-sam-fg transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
          panelOpen ? "translate-y-0 shadow-[0_-1px_0_0_rgba(15,23,42,0.06)]" : "translate-y-full shadow-none"
        }`}
      >
        <div className="relative shrink-0 border-b border-sam-border bg-sam-surface/95 px-3 py-2.5 pr-11">
          <h2 className="text-center text-[16px] font-bold leading-tight text-sam-fg">거래 글쓰기</h2>
          <button
            type="button"
            onClick={onHeaderClose}
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-ui-rect text-sam-fg transition hover:bg-sam-surface-muted active:opacity-90"
            aria-label="닫기"
          >
            <span className="text-[22px] font-light leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <WriteSheetFlowInner
            key={openEpoch}
            mode="tradeSheet"
            categoryKey={sheetCategoryKey}
            onTradeSheetCategoryChange={setSheetCategoryKey}
            pathnameForAuth={pathname}
            onUserRequestClose={() => {
              void exitAndClose();
            }}
            onSuccessNavigate={onSuccessNavigate}
            onTradeSheetBlockingDraftChange={setBlockingDraft}
          />
        </div>
      </div>
    </div>
  );
}
