"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { messengerSectionLabel } from "@/lib/community-messenger/messenger-ia";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

const SECTIONS: MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"];

export type MessengerTabsProps = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/** 메신저 1차 탭 — `TradePrimaryTabs` embed 와 동일 셸·`sam-tab` 밑줄 활성. */
export function MessengerTabs({ value, onChange }: MessengerTabsProps) {
  return (
    <div
      data-cm-primary-nav
      className={`${APP_MAIN_GUTTER_NEG_X_CLASS} min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface`}
    >
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <HorizontalDragScroll
          className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label="메신저 구역"
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
                className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
              >
                {messengerSectionLabel(id)}
              </button>
            );
          })}
        </HorizontalDragScroll>
      </div>
    </div>
  );
}
