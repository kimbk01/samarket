"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { messengerSectionLabel } from "@/lib/community-messenger/messenger-ia";

const SECTIONS: MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"];

type Props = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
  badge?: Partial<Record<MessengerMainSection, number>>;
};

/**
 * 메신저 1차 네비 — 친구 / 채팅 / 오픈채팅 / 보관함 (카카오 IA, LINE·FB 톤의 얇은 세그먼트).
 */
export function MessengerPrimarySectionNav({ value, onChange, badge }: Props) {
  return (
    <div className="flex w-full gap-0 border-b border-ui-border bg-ui-surface pb-0 shadow-[var(--ui-shadow-card)]">
      {SECTIONS.map((id) => {
        const active = value === id;
        const count = badge?.[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`relative min-w-0 flex-1 px-1 py-3 text-[13px] font-medium transition-colors ${
              active ? "text-ui-fg" : "text-ui-muted hover:text-ui-fg"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <span className="truncate">{messengerSectionLabel(id)}</span>
              {typeof count === "number" && count > 0 ? (
                <span
                  className={`min-w-[18px] rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                    active ? "bg-neutral-900 text-white" : "bg-ui-hover text-ui-muted"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </span>
            {active ? <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-neutral-900" /> : null}
          </button>
        );
      })}
    </div>
  );
}
