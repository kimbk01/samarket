"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MAX_CHAT_IMAGE_ATTACH } from "@/lib/chats/chat-image-bundle";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

type Props = {
  open: boolean;
  files: File[];
  onClose: () => void;
  /** 최종 선택(묶음 전송) */
  onConfirm: (files: File[]) => void;
};

/**
 * INTENTIONAL full-screen media editor (overlay z + dark surface).
 * Uses DibayOverlayRoot for portal/scroll-lock/Escape; keeps dark editor chrome
 * (not white OverlayUi.fullSheet) for photo selection UX.
 */
export function ChatMobileImagePickerSheet({ open, files, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open || !files.length) return;
    setSelected(new Set(files.map((_, i) => i)));
  }, [open, files]);

  const capped = useMemo(() => files.slice(0, MAX_CHAT_IMAGE_ATTACH), [files]);

  const objectUrls = useMemo(() => capped.map((f) => URL.createObjectURL(f)), [capped]);

  useEffect(() => {
    return () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [objectUrls]);

  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    const out = capped.filter((_, i) => selected.has(i));
    if (!out.length) return;
    onConfirm(out);
    onClose();
  }, [capped, onConfirm, onClose, selected]);

  if (!open || !capped.length) return null;

  const selectedCount = capped.reduce((n, _, i) => n + (selected.has(i) ? 1 : 0), 0);

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={false}
      placement="full"
      zRole="sheet"
      zIndexClass={MAIN_BOTTOM_NAV_SHEET_Z_CLASS}
      ariaLabel={t("chats_select_photo_aria")}
      stageClassName="!p-0"
      stageStyle={{ height: "100dvh", maxHeight: "100dvh" }}
    >
      <div
        className="relative z-[1] flex h-full min-h-0 w-full flex-col bg-[color:var(--overlay-backdrop)] text-white"
        data-dibay-overlay="chat-image-picker-full"
        style={{
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          background: "rgba(0,0,0,0.92)",
        }}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-sam-surface/10 px-2 py-2.5">
          <button
            type="button"
            data-kasama-round-full
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-sam-surface/10"
            aria-label={t("common_close")}
            onClick={onClose}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <span className="sam-text-body font-semibold">{t("chats_recent_items")}</span>
            <span className="ml-1 text-white/50" aria-hidden>
              ▾
            </span>
          </div>
          <button
            type="button"
            disabled={selectedCount === 0}
            className="shrink-0 rounded-ui-rect px-3 py-2 sam-text-body font-semibold text-signature disabled:text-white/25"
            onClick={confirm}
          >
            {t("common_send")}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 py-1">
          <div className="grid grid-cols-3 gap-px bg-sam-surface/15">
            {objectUrls.map((src, i) => {
              const on = selected.has(i);
              return (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  className="relative aspect-square w-full overflow-hidden bg-[color:var(--overlay-backdrop)] active:opacity-90"
                  onClick={() => toggle(i)}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <span
                    className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm ${
                      on
                        ? "border-signature bg-signature text-white"
                        : "border-sam-surface/85 bg-sam-surface/35 backdrop-blur-[2px]"
                    }`}
                  >
                    {on ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="shrink-0 border-t border-sam-surface/10 bg-black/90 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEE500] text-base font-bold text-sam-fg shadow-sm"
              aria-hidden
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="sam-text-body font-semibold leading-tight">{t("chats_bundle_send_title")}</p>
              <p className="sam-text-xxs text-white/55">
                선택 {selectedCount}장 · 최대 {MAX_CHAT_IMAGE_ATTACH}장
              </p>
            </div>
            <div className="flex shrink-0 gap-2 opacity-45" aria-hidden>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sam-surface/10 text-lg">✨</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sam-surface/10 text-lg">⋯</span>
            </div>
          </div>
        </footer>
      </div>
    </DibayOverlayRoot>
  );
}
