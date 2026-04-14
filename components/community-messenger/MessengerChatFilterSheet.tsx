"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

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

  if (!open || typeof document === "undefined") return null;
  if (!document.body) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/45" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        data-messenger-chat-filter-sheet="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-[61] mx-auto w-full max-w-[520px] rounded-t-[24px] bg-[color:var(--messenger-surface)] shadow-[0_-18px_48px_rgba(15,23,42,0.22)]"
      >
        <div className="flex justify-center pb-2 pt-3" aria-hidden>
          <span className="h-1 w-11 rounded-full bg-[color:var(--messenger-divider)]" />
        </div>
        <div className="border-b border-[color:var(--messenger-divider)] px-4 pb-3 pt-1">
          <p id={titleId} className="text-[16px] font-semibold" style={{ color: "var(--messenger-text)" }}>
            대화 필터
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            유형별로 빠르게 전환하세요. 고정은 핀 아이콘으로, 안읽음은 뱃지로 확인합니다.
          </p>
        </div>

        <nav className="px-4 py-3" aria-label="대화 유형 선택">
          <div className="grid grid-cols-2 gap-2">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onSelect(chip)}
                className={`min-h-[48px] rounded-[16px] border px-3 text-left text-[13px] font-semibold active:opacity-90 ${
                  value === chip
                    ? "border-[color:var(--messenger-primary)] bg-[color:var(--messenger-primary)] text-white"
                    : "border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
                }`}
                style={{ color: value === chip ? "white" : "var(--messenger-text)" }}
              >
                {messengerChatListChipLabel(chip)}
              </button>
            ))}
          </div>
        </nav>

        <button
          type="button"
          onClick={onClose}
          className="w-full border-t border-[color:var(--messenger-divider)] px-4 py-4 text-[14px] font-medium"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          닫기
        </button>
      </div>
    </>,
    document.body
  );
}

