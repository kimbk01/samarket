"use client";

import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import {
  BackIcon,
  MoreIcon,
  VideoCallIcon,
  VoiceCallIcon,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";

export function CommunityMessengerRoomPhase2Header() {
  const vm = useMessengerRoomPhase2View();
  return (
    <>
      <header className="sticky top-0 z-10 shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2 shadow-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              markCommunityMessengerHomeReturn();
              vm.router.replace(
                vm.isGroupRoom
                  ? "/community-messenger?section=chats&filter=private_group"
                  : "/community-messenger?section=chats"
              );
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text)] transition active:bg-[color:var(--cm-room-primary-soft)]"
            aria-label={vm.t("tier1_back")}
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
            {vm.snapshot.room.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vm.snapshot.room.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-[color:var(--cm-room-primary)]">
                {vm.snapshot.room.title.trim().slice(0, 1).toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-[color:var(--cm-room-text)]">
              {vm.snapshot.room.title}
            </p>
            <p className="truncate text-[11px] text-[color:var(--cm-room-text-muted)]">{vm.roomHeaderStatus}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!vm.isGroupRoom && communityMessengerRoomIsGloballyUsable(vm.snapshot.room) ? (
              <>
                <button
                  type="button"
                  onClick={() => void vm.startManagedDirectCall("voice")}
                  disabled={vm.roomUnavailable || vm.outgoingDialLocked}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--cm-room-primary)] transition active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-35"
                  aria-label={vm.t("nav_voice_call_label")}
                >
                  <VoiceCallIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void vm.startManagedDirectCall("video")}
                  disabled={vm.roomUnavailable || vm.outgoingDialLocked}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--cm-room-primary)] transition active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-35"
                  aria-label={vm.t("nav_video_call_label")}
                >
                  <VideoCallIcon className="h-5 w-5" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => vm.setActiveSheet("menu")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
              aria-label={vm.t("nav_messenger_room_menu")}
            >
              <MoreIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
