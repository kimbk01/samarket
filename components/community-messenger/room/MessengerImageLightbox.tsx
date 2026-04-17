"use client";

import { useEffect } from "react";

export function MessengerImageLightbox(props: {
  open: boolean;
  urls: string[];
  originals: string[];
  index: number;
  onClose: () => void;
  onChangeIndex: (next: number) => void;
}) {
  const { open, urls, originals, index, onClose, onChangeIndex } = props;
  if (!open || urls.length === 0) return null;
  const safeIndex = Math.max(0, Math.min(urls.length - 1, index));
  const src = urls[safeIndex] ?? "";
  const orig = originals[safeIndex] ?? src;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onChangeIndex(safeIndex - 1);
      if (e.key === "ArrowRight") onChangeIndex(safeIndex + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onChangeIndex, safeIndex]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-[14px] font-medium text-white/90 active:bg-white/10"
        >
          닫기
        </button>
        <span className="text-[13px] tabular-nums text-white/70">
          {safeIndex + 1} / {urls.length}
        </span>
        <a
          href={orig}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-3 py-2 text-[14px] font-medium text-white/90 active:bg-white/10"
        >
          원본
        </a>
      </div>
      <div className="relative min-h-0 flex-1 touch-pan-y">
        {urls.length > 1 ? (
          <>
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={() => onChangeIndex(safeIndex - 1)}
              className="absolute left-1 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 text-[22px] leading-none text-white disabled:opacity-25"
              aria-label="이전"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={safeIndex >= urls.length - 1}
              onClick={() => onChangeIndex(safeIndex + 1)}
              className="absolute right-1 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 text-[22px] leading-none text-white disabled:opacity-25"
              aria-label="다음"
            >
              ›
            </button>
          </>
        ) : null}
        <div className="flex h-full w-full items-center justify-center p-2" onClick={onClose} role="presentation">
          <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} role="presentation">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="max-h-[min(88dvh,920px)] max-w-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
}
