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
    <div className="flex w-full gap-0 border-b border-ui-border bg-ui-surface pb-0 shadow-[var(--ui-shadow-card)]">
      {SECTIONS.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`relative min-w-0 flex-1 px-1 py-3 text-[13px] font-medium transition-colors ${
              active ? "text-ui-fg" : "text-ui-muted active:text-ui-fg"
            }`}
          >
            <span className="flex items-center justify-center">
              <span className="truncate">{messengerSectionLabel(id)}</span>
            </span>
            {active ? <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-neutral-900" /> : null}
          </button>
        );
      })}
    </div>
  );
}
