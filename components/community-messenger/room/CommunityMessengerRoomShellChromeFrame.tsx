"use client";

import { memo, type ReactNode } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";

/** PASS-0 / PRE-ROUTE overlay·BN13 route shell 공통 — 데이터·effect 없는 room chrome frame only. */
export const CommunityMessengerRoomShellChromeFrame = memo(function CommunityMessengerRoomShellChromeFrame({
  narrowViewport,
  dataAttrs,
  className,
  footerSlot,
  screenReaderHidden = true,
}: {
  narrowViewport: boolean;
  dataAttrs?: Record<string, string | undefined>;
  className?: string;
  /** 실제 composer 등 — 없으면 placeholder footer */
  footerSlot?: ReactNode;
  screenReaderHidden?: boolean;
}) {
  return (
    <div
      data-messenger-shell
      data-cm-room
      {...dataAttrs}
      className={`cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)] ${className ?? ""}`}
      aria-hidden={screenReaderHidden ? true : undefined}
    >
      <header className="chat-header shrink-0">
        <div className="chat-header__row">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]" />
            <div className="h-3 w-20 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]/80" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
          </div>
        </div>
      </header>

      <div className="cm-room-timeline min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]" data-cm-room-viewport-placeholder />

      {footerSlot ?? (
        <ChatComposer>
          <div className="chat-composer__row">
            <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
            <div className="h-[38px] min-h-[38px] flex-1 rounded-full bg-[color:var(--cm-room-primary-soft)]/50" />
            <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
          </div>
        </ChatComposer>
      )}
    </div>
  );
});
