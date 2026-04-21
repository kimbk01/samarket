"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { messengerSectionLabel } from "@/lib/community-messenger/messenger-ia";

const SECTIONS: MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"];

export type MessengerTabsProps = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/** 메신저 1차 탭 — 연회색 트랙 + 흰/볼드 활성 (그림자 없음). */
export function MessengerTabs({ value, onChange }: MessengerTabsProps) {
  return (
    <div
      data-cm-primary-nav
      className="rounded-[8px] bg-[color:var(--messenger-surface-muted)] p-0.5"
      style={{ color: "var(--messenger-text)" }}
    >
      <div className="grid grid-cols-4 gap-0.5">
        {SECTIONS.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={`min-h-[36px] rounded-[6px] px-0.5 py-1 text-[13px] transition-colors ${
                active
                  ? "bg-[color:var(--messenger-surface)] font-bold text-[color:var(--messenger-text)]"
                  : "bg-transparent font-medium text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-surface)]"
              }`}
            >
              <span className="flex items-center justify-center">
                <span className="truncate">{messengerSectionLabel(id)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
