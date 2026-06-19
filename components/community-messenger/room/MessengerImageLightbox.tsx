"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MessengerImageLightbox(props: {
  open: boolean;
  urls: string[];
  originals: string[];
  index: number;
  onClose: () => void;
  onChangeIndex: (next: number) => void;
}) {
  const { t } = useI18n();
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
      aria-label={t("cm_ui_image_zoom_view")}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 pb-[max(0.5rem,var(--safe-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 sam-text-body font-medium text-white/90 active:bg-white/10"
        >
          {t("nav_close")}
        </button>
        <span className="sam-text-body-secondary tabular-nums text-white/70">
          {safeIndex + 1} / {urls.length}
        </span>
        <a
          href={orig}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-3 py-2 sam-text-body font-medium text-white/90 active:bg-white/10"
        >
          {t("cm_ui_original")}
        </a>
      </div>
      <div className="relative min-h-0 flex-1 touch-pan-y">
        {urls.length > 1 ? (
          <>
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={() => onChangeIndex(safeIndex - 1)}
              className="absolute left-1 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 sam-text-hero leading-none text-white disabled:opacity-25"
              aria-label={t("tier1_back")}
            >
              ‹
            </button>
            <button
              type="button"
              disabled={safeIndex >= urls.length - 1}
              onClick={() => onChangeIndex(safeIndex + 1)}
              className="absolute right-1 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 sam-text-hero leading-none text-white disabled:opacity-25"
              aria-label={t("common_next")}
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
