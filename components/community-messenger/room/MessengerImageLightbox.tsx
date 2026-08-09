"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackIcon } from "@/components/navigation/AppBackButton";

/**
 * Messenger message image expand viewer.
 *
 * CONTRACT:
 * - Portal to `document.body` so `position:fixed` is NOT trapped by `.messenger-page`
 *   (`transform` / `contain: layout paint` containing block).
 * - Image height is bounded by the lightbox flex body (`max-h-full`), never viewport-vh units
 *   (layout vh can exceed remaining chrome + visualViewport on native WebView).
 * - Root clips overflow; no document-width spill from expand.
 * DO NOT: mount under room timeline without portal; DO NOT size img with viewport-vh units.
 */
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const safeIndex = Math.max(0, Math.min(Math.max(urls.length - 1, 0), index));
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

  // Lock page scroll while open (body portal layer owns the gesture surface).
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  if (!open || urls.length === 0 || !mounted) return null;

  const node = (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden overscroll-none bg-black/92 pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-label={t("cm_ui_image_zoom_view")}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
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
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {urls.length > 1 ? (
          <>
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={() => onChangeIndex(safeIndex - 1)}
              className="absolute left-1 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 sam-text-hero leading-none text-white disabled:opacity-25"
              aria-label={t("tier1_back")}
            >
              <AppBackIcon />
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
        <div
          className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden p-2"
          onClick={onClose}
          role="presentation"
        >
          <div
            className="flex max-h-full max-w-full min-h-0 min-w-0 items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
