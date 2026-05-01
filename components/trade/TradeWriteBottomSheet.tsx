"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/types/category";
import { WriteSheetFlowInner } from "@/components/write/WriteSheetFlowInner";
import { APP_TRADE_WRITE_SHEET_SCROLL_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { TRADE_WRITE_EXIT_SHEET_BODY, TRADE_WRITE_EXIT_SHEET_TITLE } from "@/lib/posts/trade-write-exit-cleanup";

const SHEET_EXIT_MS = 520;

/**
 * `/market/…` — 거래 글쓰기를 **티어1·탭 헤더까지 포함해 뷰포트 전체** 덮는 시트로 표시(아래→위 슬라이드).
 * z-index 는 확인 모달(`MobileConfirmBottomSheet` 등 z≥65)보다 낮게 유지한다.
 */
export function TradeWriteBottomSheet() {
  const router = useRouter();
  const pathname = usePathname() ?? "/philife";
  const {
    isOpen,
    openEpoch,
    close,
    setBlockingDraft,
    blockingDraft,
    initialCategory,
    persistSnapshotBeforeLeaveRef,
  } = useTradeWriteSheet();
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [sheetCategoryKey, setSheetCategoryKey] = useState("");
  const enterRafRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const exitInFlightRef = useRef(false);
  const [headerLeaveOpen, setHeaderLeaveOpen] = useState(false);

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
    if (blockingDraft) {
      setHeaderLeaveOpen(true);
      return;
    }
    void exitAndClose();
  }, [blockingDraft, exitAndClose]);

  const handleHeaderLeaveConfirm = useCallback(() => {
    setHeaderLeaveOpen(false);
    void (async () => {
      try {
        await persistSnapshotBeforeLeaveRef.current?.();
      } catch {
        /* 스냅샷 실패해도 닫기 진행 */
      }
      await exitAndClose();
    })();
  }, [exitAndClose, persistSnapshotBeforeLeaveRef]);

  const handleHeaderLeaveCancel = useCallback(() => setHeaderLeaveOpen(false), []);

  if (!isOpen) return null;

  const panelOpen = enterDraw && !isExiting;

  return (
    <>
      <MobileConfirmBottomSheet
        open={headerLeaveOpen}
        onCancel={handleHeaderLeaveCancel}
        title={TRADE_WRITE_EXIT_SHEET_TITLE}
        description={TRADE_WRITE_EXIT_SHEET_BODY}
        cancelLabel="계속 작성"
        confirmLabel="나가기"
        confirmTone="primary"
        onConfirm={handleHeaderLeaveConfirm}
        zIndexClass="z-[65]"
        ariaLabel="거래 글쓰기 닫기 확인"
        interactionMode="blocking"
      />
      <div
      className="pointer-events-none fixed inset-0 z-[50] flex flex-col"
      role="dialog"
      aria-modal
      aria-label="거래 글쓰기"
    >
      <div
        ref={panelRef}
        className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-sam-app pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-sam-fg transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
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
            />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
