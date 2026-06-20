"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PhilifeNeighborhoodWriteForm } from "@/components/philife/PhilifeNeighborhoodWriteForm";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";
import { philifeWriteSheetOuterPaddingStyle } from "@/lib/ui/philife-write-sheet-keyboard-layout";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";

const SHEET_EXIT_MS = 520;

/**
 * `/philife` + 글쓰기: **뷰포트 전체** 아래→위 슬라이드 (`TradeWriteBottomSheet` 동일).
 * 헤더 우측 × 로만 닫기(초안 있으면 확인). 키보드는 outer `paddingBottom` + flex footer.
 */
export function PhilifeWriteBottomSheet() {
  const { t } = useI18n();
  const { isOpen, openEpoch, initialCategory, close, setBlockingDraft, blockingDraft } =
    usePhilifeWriteSheet();
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [headerLeaveOpen, setHeaderLeaveOpen] = useState(false);
  const enterRafRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const exitInFlightRef = useRef(false);
  const keyboardInset = useMobileKeyboardInset({ enabled: isOpen });

  useLayoutEffect(() => {
    if (enterRafRef.current != null) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = null;
    }
    if (!isOpen) {
      setEnterDraw(false);
      setIsExiting(false);
      setHeaderLeaveOpen(false);
      return;
    }
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
  }, [isOpen, openEpoch]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

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

  const onHeaderClose = useCallback(() => {
    if (blockingDraft) {
      setHeaderLeaveOpen(true);
      return;
    }
    void exitAndClose();
  }, [blockingDraft, exitAndClose]);

  const handleHeaderLeaveConfirm = useCallback(() => {
    setHeaderLeaveOpen(false);
    void exitAndClose();
  }, [exitAndClose]);

  const handleHeaderLeaveCancel = useCallback(() => setHeaderLeaveOpen(false), []);

  if (!isOpen) return null;

  const panelOpen = enterDraw && !isExiting;
  const sheetTitle =
    initialCategory.trim() === "meetup"
      ? t("philife_write_meetup_create_title")
      : t("community_compose_write");
  const outerStyle = philifeWriteSheetOuterPaddingStyle(keyboardInset);

  return (
    <>
      <MobileConfirmBottomSheet
        open={headerLeaveOpen}
        onCancel={handleHeaderLeaveCancel}
        title={t("ui_write_exit_title")}
        description={t("ui_write_exit_body")}
        cancelLabel={t("ui_write_exit_continue")}
        confirmLabel={t("ui_write_exit_confirm")}
        confirmTone="primary"
        onConfirm={handleHeaderLeaveConfirm}
        zIndexClass="z-[65]"
        ariaLabel={t("ui_write_exit_aria")}
        interactionMode="blocking"
      />
      <div
        className="pointer-events-none fixed inset-0 z-[50] flex flex-col"
        style={outerStyle}
        role="dialog"
        aria-modal
        aria-label={sheetTitle}
      >
        <div
          ref={panelRef}
          className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white pt-[var(--safe-top)] text-[#050505] transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
            panelOpen ? "translate-y-0 shadow-[0_-1px_0_0_rgba(15,23,42,0.06)]" : "translate-y-full shadow-none"
          }`}
        >
          <div className="relative shrink-0 border-b border-[#e4e6eb] bg-white px-3 py-2.5 pr-11">
            <h2 className="text-center text-[16px] font-bold leading-tight text-[#050505]">{sheetTitle}</h2>
            <button
              type="button"
              onClick={onHeaderClose}
              className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-ui-rect text-[#050505] transition hover:bg-[#f0f2f5] active:opacity-90"
              aria-label={t("common_close")}
            >
              <span className="text-[22px] font-light leading-none" aria-hidden>
                ×
              </span>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[var(--safe-bottom)]">
            <PhilifeNeighborhoodWriteForm
              key={openEpoch}
              initialCategory={initialCategory}
              suppressWriteScreenTier1
              onSheetExitBeforeNavigate={exitAndClose}
              onSheetClose={exitAndClose}
              onSheetBlockingDraftChange={setBlockingDraft}
            />
          </div>
        </div>
      </div>
    </>
  );
}
