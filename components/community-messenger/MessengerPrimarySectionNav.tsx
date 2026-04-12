"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { messengerSectionLabel } from "@/lib/community-messenger/messenger-ia";

const SECTIONS: MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"];

type Props = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/**
 * 메신저 1차 네비 — 친구 / 채팅 / 오픈채팅 / 보관함 (모바일 메신저: 라벨만, 숫자 배지 없음).
 */
export function MessengerPrimarySectionNav({ value, onChange }: Props) {
  return (
    <div
      className="sam-tabs rounded-t-[var(--messenger-radius-md)] pb-0 shadow-[var(--messenger-shadow-soft)]"
      style={{ color: "var(--messenger-text)" }}
    >
      {SECTIONS.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className="sam-tab py-3 text-[13px] transition-colors active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: active ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
          >
            <span className="flex items-center justify-center">
              <span className="truncate">{messengerSectionLabel(id)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
