"use client";

import { useLayoutEffect, useState, useCallback, useEffect, useRef } from "react";
import { PhilifeNeighborhoodWriteForm } from "@/components/philife/PhilifeNeighborhoodWriteForm";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { usePhilifeComposerKeyboardStage } from "@/components/philife/PhilifeWriteComposerChrome";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

const SHEET_EXIT_MS = 520;

/**
 * `/philife` 1단(+): 글쓰기 폼 — DIBAY Full/Form Sheet visual SSOT.
 * Intentional fullscreen workflow (covers bottom nav while open).
 * Exit animation + draft business handlers preserved.
 */
export function PhilifeWriteBottomSheet() {
  const { t } = useI18n();
  const { isOpen, openEpoch, initialCategory, close, setBlockingDraft } = usePhilifeWriteSheet();
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const enterRafRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const exitInFlightRef = useRef(false);
  const { stageStyle: keyboardStageStyle } = usePhilifeComposerKeyboardStage();

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

  const lockBody = isOpen;
  useRegisterOpenOverlay(isOpen);
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
  const sheetTitle = t("philife_write_composer_title");

  /** 화면 전체 작성기 — 피드 헤더·하단 탭까지 덮는다. 헤더(✕·제목·등록)는 작성기가 그린다 (재설계 2026-11-01) */
  return (
    <div
      className={`pointer-events-none fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS} flex flex-col`}
      role="dialog"
      aria-modal
      aria-label={sheetTitle}
      data-dibay-overlay="full-sheet"
      data-overlay-nav-mode="fullscreen-workflow"
      style={keyboardStageStyle}
    >
      <div
        ref={panelRef}
        data-form-keyboard-surface="1"
        data-keyboard-tap-dismiss="1"
        className={`${OverlayUi.fullSheet} pointer-events-auto`}
        /** `.dibay-overlay-full-sheet` 기본 transform(아래 숨김)을 열림 상태로 덮는다 — 전환 시간은 클래스 */
        style={{ transform: panelOpen ? "translateY(0)" : "translateY(100%)" }}
      >
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
  );
}
