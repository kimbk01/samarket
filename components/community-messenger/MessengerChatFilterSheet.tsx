"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerChatListChipLabel, type MessengerChatListChip } from "@/lib/community-messenger/messenger-ia";

const FILTER_CHIPS: readonly MessengerChatListChip[] = ["all", "direct", "private_group", "trade", "delivery"] as const;

export function MessengerChatFilterSheet({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: MessengerChatListChip;
  onClose: () => void;
  onSelect: (next: MessengerChatListChip) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) onClose();
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      closeBtnRef.current?.focus();
    });
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] isolate">
      <div className="absolute inset-0 z-0 bg-black/60" aria-hidden onClick={onClose} />
      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-4 py-6 sm:px-5">
        <div
          ref={panelRef}
          data-messenger-chat-filter-sheet="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pointer-events-auto flex max-h-[min(82dvh,520px)] w-full max-w-[min(100%,340px)] flex-col overflow-hidden rounded-2xl border border-sam-border bg-sam-surface text-sam-fg shadow-2xl"
        >
          <div className="relative flex shrink-0 flex-col gap-1 border-b border-sam-border bg-sam-surface px-4 pb-3 pt-4">
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label={t("nav_close")}
              className="absolute right-1 top-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sam-muted transition-colors [-webkit-tap-highlight-color:transparent] active:bg-sam-surface-muted"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p id={titleId} className="pr-11 text-[17px] font-semibold leading-snug tracking-tight text-sam-fg">
              대화 필터
            </p>
            <p className="pr-11 text-[12px] leading-relaxed text-sam-muted">
              유형별로 빠르게 전환하세요. 고정은 핀 아이콘으로, 안읽음은 뱃지로 확인합니다.
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto bg-sam-surface px-3 py-3" aria-label="대화 유형 선택">
            <ul className="flex flex-col gap-1.5">
              {FILTER_CHIPS.map((chip) => {
                const selected = value === chip;
                return (
                  <li key={chip}>
                    <button
                      type="button"
                      onClick={() => onSelect(chip)}
                      className={[
                        "flex min-h-[48px] w-full items-center rounded-ui-rect border px-4 text-left text-[15px] font-medium transition-colors [-webkit-tap-highlight-color:transparent] active:opacity-95",
                        selected
                          ? "border-signature bg-signature text-white shadow-sm"
                          : "border-sam-border bg-sam-surface-muted text-sam-fg active:bg-sam-surface",
                      ].join(" ")}
                    >
                      {messengerChatListChipLabel(chip)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>,
    document.body
  );
}

