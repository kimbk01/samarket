"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayUsableAreaSheet } from "@/components/ui/dibay-overlay/DibayUsableAreaSheet";

/**
 * 내정보 시트 등장·닫힘 = 280ms (최종 설계 X10 · `MYPAGE_MOTION_MS.sheet`).
 * 공용 오버레이 CSS(300ms, 전 도메인)는 바꾸지 않고 내정보 시트 패널에만 지정한다.
 */
export const MYPAGE_SHEET_PANEL_MOTION_CLASS = "![transition-duration:280ms]";

/** 아래로 이만큼(px) 끌면 닫기 요청 */
export const MYPAGE_SHEET_DRAG_CLOSE_PX = 80;

/**
 * Mypage sheets consume the shared usable-area authority (OPTION B).
 * No parallel VV portal — migration complete for this shell.
 *
 * - 핸들 표시 + 아래로 끌어 닫기(S01). 닫기는 항상 `onClose` 를 거친다 — 미저장 확인은 소비자가 정한다.
 * - `footer` = 키보드 위 하단 고정 CTA 슬롯 (Form SSOT 는 공용 시트가 소유).
 */
export function MypageBottomSheetShell({
  open,
  onClose,
  title,
  children,
  ariaLabel,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  ariaLabel?: string;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const dragRef = useRef<{ startY: number; dy: number; panel: HTMLElement | null } | null>(null);

  const resetPanel = (panel: HTMLElement | null, animate: boolean) => {
    if (!panel) return;
    panel.style.transition = animate ? "" : "none";
    panel.style.transform = "";
  };

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const panel = (e.currentTarget.closest("[data-dibay-usable-area-sheet]") as HTMLElement | null) ?? null;
    dragRef.current = { startY: e.clientY, dy: 0, panel };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    if (drag.panel) {
      drag.panel.style.transition = "none";
      drag.panel.style.transform = `translateY(${drag.dy}px)`;
    }
  };

  const onHandlePointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    resetPanel(drag.panel, true);
    if (drag.dy >= MYPAGE_SHEET_DRAG_CLOSE_PX) onClose();
  };

  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel ?? title}
      anchor="above-bottom-nav"
      preferredHeightRatio={null}
      showHandle={false}
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
      panelClassName={MYPAGE_SHEET_PANEL_MOTION_CLASS}
      header={
        <div>
          <div
            className="flex h-6 cursor-grab touch-none items-start justify-center active:cursor-grabbing"
            data-testid="mypage-sheet-drag-handle"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            aria-hidden
          >
            <div className={`${OverlayUi.sheetHandle} !mb-0`} />
          </div>
          <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-1 py-1">
            <h2 className={`truncate ${OverlayUi.title} ${OverlayUi.titleSheet} !text-left`}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="dibay-overlay-btn dibay-overlay-btn--text !min-h-9 !w-9 !flex-none !p-0"
              aria-label={t("common_close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      }
      footer={footer}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-3">{children}</div>
    </DibayUsableAreaSheet>
  );
}
