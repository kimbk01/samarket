"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";

/**
 * 모바일·태블릿: + 탭 후 네이티브 앨범/카메라로 가기 전 단계.
 * OS 사진 선택 UI는 브라우저가 띄우므로 커스터마이즈 불가 — 그 전에 우리 시트로 취소(X·배경) 가능하게 함.
 */
export function ChatMobileAttachSheet({
  open,
  onClose,
  instagram,
  disabled,
  onPickCamera,
  onPickGallery,
}: {
  open: boolean;
  onClose: () => void;
  instagram: boolean;
  disabled: boolean;
  onPickCamera: () => void;
  onPickGallery: () => void;
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
    },
    [open, onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onKeyDown]);

  if (!open || typeof document === "undefined") return null;

  const rowClass = `flex w-full shrink-0 items-center gap-3 rounded-ui-rect px-4 py-3.5 text-left sam-text-body font-medium transition active:scale-[0.99] disabled:opacity-45 ${
    instagram
      ? "text-foreground hover:bg-black/[0.04] active:bg-black/[0.06]"
      : "text-foreground hover:bg-sam-primary-soft active:bg-sam-primary-soft"
  }`;

  const runThenPick = (pick: () => void) => {
    onClose();
    window.setTimeout(() => pick(), 0);
  };

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 z-[100] flex flex-col justify-end ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
      role="dialog"
      aria-modal
      aria-labelledby="chat-attach-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className={`relative mx-auto max-h-[min(85dvh,calc(100dvh-4rem-env(safe-area-inset-bottom,0px)))] w-full max-w-lg overflow-y-auto rounded-t-[length:var(--ui-radius-rect)] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] ${
          instagram ? "border-t border-sam-border bg-sam-surface" : "border-t border-sam-border bg-sam-surface"
        }`}
        style={{
          paddingBottom: "max(1.25rem, calc(12px + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-sam-fg/[0.06] bg-sam-surface px-3 py-3">
          <h2 id="chat-attach-sheet-title" className="min-w-0 flex-1 pl-1 sam-text-body-lg font-semibold text-sam-fg">
            사진 보내기
          </h2>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-black/5"
            aria-label="닫기"
            disabled={disabled}
            onClick={onClose}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <nav className="flex flex-col px-2 pb-5 pt-2" aria-label="첨부 방법">
          <button
            type="button"
            className={rowClass}
            disabled={disabled}
            onClick={() => runThenPick(onPickCamera)}
          >
            <CameraGlyph className="h-6 w-6 shrink-0 opacity-85" />
            사진 촬영
          </button>
          <button
            type="button"
            className={rowClass}
            disabled={disabled}
            onClick={() => runThenPick(onPickGallery)}
          >
            <GalleryGlyph className="h-6 w-6 shrink-0 opacity-85" />
            앨범에서 선택
          </button>
        </nav>
      </div>
    </div>,
    document.body
  );
}

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GalleryGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
