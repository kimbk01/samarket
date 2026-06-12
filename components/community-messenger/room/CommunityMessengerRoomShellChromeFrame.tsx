"use client";

import { memo, type CSSProperties, type ReactNode } from "react";

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
      {...dataAttrs}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)] ${className ?? ""}`}
      style={
        narrowViewport
          ? ({
              height: "var(--chat-viewport-height, 100dvh)",
              maxHeight: "var(--chat-viewport-height, 100dvh)",
              minHeight: 0,
            } satisfies CSSProperties)
          : undefined
      }
      aria-hidden={screenReaderHidden ? true : undefined}
    >
      <header className="shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-3">
        <div className="flex items-center gap-3">
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

      <div className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]" data-cm-room-viewport-placeholder />

      {footerSlot ?? (
        <footer
          data-cm-composer
          data-cm-line-composer-footer
          className="sticky bottom-0 z-[5] shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-2"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
            <div className="h-[38px] min-h-[38px] flex-1 rounded-full bg-[color:var(--cm-room-primary-soft)]/50" />
            <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
          </div>
        </footer>
      )}
    </div>
  );
});
