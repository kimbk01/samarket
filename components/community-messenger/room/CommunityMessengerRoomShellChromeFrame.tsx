"use client";

import { memo, type ReactNode } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

export type CommunityMessengerRoomShellHeaderSeed = {
  title?: string | null;
  avatarUrl?: string | null;
};

/** PASS-0 / PRE-ROUTE overlay·BN13 route shell 공통 — 데이터·effect 없는 room chrome frame only. */
export const CommunityMessengerRoomShellChromeFrame = memo(function CommunityMessengerRoomShellChromeFrame({
  narrowViewport,
  dataAttrs,
  className,
  footerSlot,
  headerSeed,
  screenReaderHidden = true,
}: {
  narrowViewport: boolean;
  dataAttrs?: Record<string, string | undefined>;
  className?: string;
  /** 실제 composer 등 — 없으면 placeholder footer */
  footerSlot?: ReactNode;
  headerSeed?: CommunityMessengerRoomShellHeaderSeed | null;
  screenReaderHidden?: boolean;
}) {
  const title = headerSeed?.title?.trim() ?? "";
  const avatarSrc = resolveUserAvatarImageSrc(headerSeed?.avatarUrl);
  const showHeaderSeed = Boolean(title || avatarSrc);

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
          {showHeaderSeed ? (
            <>
              <div className="relative h-9 w-9 shrink-0 self-center">
                <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                  <SamarketThumbnail
                    src={avatarSrc}
                    fill
                    roundedClassName="rounded-full"
                    className="bg-[color:var(--cm-room-primary-soft)]"
                    fallbackSrc=""
                    fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                  />
                </div>
              </div>
              <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center">
                <p className="truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                  {title || "\u00a0"}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-32 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]" />
                <div className="h-3 w-20 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]/80" />
              </div>
            </>
          )}
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
