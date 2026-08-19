"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/types/category";
import { WriteSheetFlowInner } from "@/components/write/WriteSheetFlowInner";
import { APP_TRADE_WRITE_SHEET_SCROLL_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

const SHEET_EXIT_MS = 520;

/**
 * `/market/…` — 거래 글쓰기를 **티어1·탭 헤더까지 포함해 뷰포트 전체** 덮는 시트로 표시(아래→위 슬라이드).
 * z-index 는 확인 모달(`MobileConfirmBottomSheet` 등 z≥65)보다 낮게 유지한다.
 */
export function TradeWriteBottomSheet() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/philife";
  const {
    isOpen,
    openEpoch,
    close,
    setBlockingDraft,
    initialCategory,
    persistSnapshotBeforeLeaveRef,
  } = useTradeWriteSheet();
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [sheetCategoryKey, setSheetCategoryKey] = useState("");
  const enterRafRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const stickyChromeRef = useRef<HTMLDivElement | null>(null);
  const exitInFlightRef = useRef(false);
  const tryCloseFromFlowRef = useRef<() => void>(() => {});
  const { effectiveViewportBottom } = useFormKeyboardViewport({ enabled: isOpen });
  useFormKeyboardFocusVisibility({
    enabled: isOpen,
    scrollRootRef: scrollBodyRef,
    stickyChromeRef,
    effectiveViewportBottom,
  });

  useLayoutEffect(() => {
    if (enterRafRef.current != null) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = null;
    }
    if (!isOpen) {
      setEnterDraw(false);
      setIsExiting(false);
      setSheetCategoryKey("");
      return;
    }
    /** 신규 `open("")` 는 빈 값, 지도 복귀 `open(카테고리키)` 는 이어 쓰기 */
    setSheetCategoryKey((initialCategory ?? "").trim());
    setIsExiting(false);
    setEnterDraw(false);
    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = null;
      setEnterDraw(true);
    });
    return () => {
      if (enterRafRef.current != null) {
        cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
    };
  }, [isOpen, openEpoch, initialCategory]);

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
    tryCloseFromFlowRef.current();
  }, []);

  if (!isOpen) return null;

  const panelOpen = enterDraw && !isExiting;

  return (
    <div
      className={`pointer-events-none fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS} flex flex-col`}
      role="dialog"
      aria-modal
      aria-label={t("ui_write_trade_sheet_title")}
      data-dibay-overlay="full-sheet"
      data-overlay-nav-mode="fullscreen-workflow"
    >
      <div
        ref={panelRef}
        data-form-keyboard-surface="1"
        className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[color:var(--overlay-surface)] pt-[var(--safe-top)] text-[color:var(--overlay-text-primary)] transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
          panelOpen ? "translate-y-0 shadow-[var(--overlay-elevation-1)]" : "translate-y-full shadow-none"
        }`}
      >
        <div
          ref={stickyChromeRef}
          data-form-keyboard-sticky-chrome="1"
          className="relative shrink-0 border-b border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2.5 pr-11"
        >
          <h2 className="dibay-overlay-title dibay-overlay-title--sheet">{t("ui_write_trade_sheet_title")}</h2>
          <button
            type="button"
            onClick={onHeaderClose}
            className="dibay-overlay-btn dibay-overlay-btn--text absolute right-2 top-1/2 !min-h-9 !w-9 !flex-none !-translate-y-1/2 !p-0"
            aria-label={t("common_close")}
          >
            <span className="text-[22px] font-light leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>
        <div
          ref={scrollBodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        >
          <div className={APP_TRADE_WRITE_SHEET_SCROLL_COLUMN_CLASS}>
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
              onExposeTryClose={(fn) => {
                tryCloseFromFlowRef.current = fn;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
