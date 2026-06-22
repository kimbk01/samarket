"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  CommunityMessengerMessage,
  CommunityMessengerMessageActionAnchorRect,
} from "@/lib/community-messenger/types";

export type CallStubActionPopoverProps = {
  open: { item: CommunityMessengerMessage; anchorRect: CommunityMessengerMessageActionAnchorRect };
  roomUnavailable: boolean;
  redialDisabled: boolean;
  onClose: () => void;
  onRedial: (kind: "voice" | "video") => void;
};

export function CallStubActionPopover(props: CallStubActionPopoverProps) {
  const { t } = useI18n();
  const { open, roomUnavailable, redialDisabled, onClose } = props;
  const { item, anchorRect } = open;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: anchorRect.top, left: anchorRect.left });
  /**
   * touch-through 방지: 탭 손가락을 뗄 때 발생하는 click 이벤트가
   * backdrop에 전달되어 팝오버가 즉시 닫히는 "깜빡거림"을 막는다.
   * DO NOT: 이 guard를 제거하면 통화 탭 팝오버가 열리자마자 닫힘.
   */
  const openedAtRef = useRef<number>(Date.now());

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const pw = el.offsetWidth || 260;
    const ph = el.offsetHeight || 200;
    const margin = 8;
    let top = anchorRect.top - ph - margin;
    if (top < margin) {
      top = Math.min(anchorRect.bottom + margin, vh - ph - margin);
    }
    const leftBias = (anchorRect.left + anchorRect.right) / 2 > vw / 2;
    let left = leftBias ? anchorRect.right - pw - margin : anchorRect.left;
    left = Math.max(margin, Math.min(left, vw - pw - margin));
    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, [item.id]);

  /** 팝오버 열림 동안 뒤 타임라인·입력 스크롤·탭 전달 차단 */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = item.callKind === "video" ? "video" : "voice";
  const redialLabel = t("cm_ui_redial");

  const popoverBackdropStyle = {
    WebkitTouchCallout: "none" as const,
    touchAction: "none" as const,
    userSelect: "none" as const,
  };

  const node = (
    <div
      className="fixed inset-0 z-[220] touch-none select-none"
      style={popoverBackdropStyle}
      role="presentation"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent touch-none"
        aria-label={t("nav_close")}
        onPointerDown={(e) => {
          if (Date.now() - openedAtRef.current < 350) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClose();
        }}
        onClick={(e) => {
          if (Date.now() - openedAtRef.current < 350) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className="absolute z-[221] w-[min(92vw,280px)] overflow-hidden rounded-[14px] border border-neutral-200 bg-white text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.22)] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={roomUnavailable || redialDisabled}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 px-4 py-3 sam-text-body font-semibold text-[color:var(--cm-room-primary)] disabled:opacity-45 active:bg-neutral-100 dark:active:bg-neutral-900"
          onClick={() => {
            onClose();
            props.onRedial(kind);
          }}
        >
          {redialLabel}
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
