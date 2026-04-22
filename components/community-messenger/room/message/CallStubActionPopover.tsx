"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  onFocusComposer: () => void;
  onCopyText: () => void;
  onHideLocal: () => void;
};

function MenuRow({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full flex-col items-start justify-center border-b border-neutral-200 px-4 py-2.5 text-left sam-text-body font-medium text-neutral-900 last:border-b-0 disabled:opacity-45 dark:border-neutral-700 dark:text-neutral-100 ${
        danger ? "text-red-600 dark:text-red-400" : ""
      } active:bg-neutral-100 dark:active:bg-neutral-900`}
    >
      {label}
    </button>
  );
}

export function CallStubActionPopover(props: CallStubActionPopoverProps) {
  const { open, roomUnavailable, redialDisabled, onClose } = props;
  const { item, anchorRect } = open;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: anchorRect.top, left: anchorRect.left });

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = item.callKind === "video" ? "video" : "voice";

  const node = (
    <div className="fixed inset-0 z-[62]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-black/45" aria-label="닫기" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute z-[63] w-[min(92vw,280px)] overflow-hidden rounded-[14px] border border-neutral-200 bg-white text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.22)] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <p className="sam-text-xxs font-semibold text-neutral-500 dark:text-neutral-400">통화 메시지</p>
          <p className="mt-0.5 line-clamp-2 sam-text-helper text-neutral-600 dark:text-neutral-300">{item.content}</p>
        </div>
        <nav className="flex flex-col bg-white dark:bg-neutral-950" aria-label="통화 로그 작업">
          <MenuRow
            label="다시 걸기"
            disabled={roomUnavailable || redialDisabled}
            onClick={() => {
              onClose();
              props.onRedial(kind);
            }}
          />
          <MenuRow
            label="메시지 보내기"
            disabled={roomUnavailable}
            onClick={() => {
              onClose();
              props.onFocusComposer();
            }}
          />
          <MenuRow
            label="텍스트 복사"
            disabled={roomUnavailable}
            onClick={() => {
              props.onCopyText();
              onClose();
            }}
          />
          <MenuRow
            label="이 기기에서만 숨기기"
            disabled={roomUnavailable}
            onClick={() => {
              props.onHideLocal();
            }}
          />
        </nav>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
