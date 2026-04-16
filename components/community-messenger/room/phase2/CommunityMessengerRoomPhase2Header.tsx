"use client";

import { useMemo, useState } from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import {
  BackIcon,
  MoreIcon,
  VideoCallIcon,
  VoiceCallIcon,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { useMessengerRoomPhase2HeaderView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-header-context";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";

function formatPresenceLine(
  state: "online" | "away" | "offline",
  lastSeenAt: string | null | undefined
): string {
  if (state === "online") return "온라인";
  if (state === "away") return "자리 비움";
  if (!lastSeenAt) return "오프라인";
  const time = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(time)) return "오프라인";
  const date = new Date(time);
  return `마지막 접속 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function CommunityMessengerRoomPhase2Header() {
  const vm = useMessengerRoomPhase2HeaderView();
  const [confirmKind, setConfirmKind] = useState<null | "voice" | "video">(null);
  const peerLabel = vm.snapshot.room.title?.trim() || "상대";
  const peerPresence = useCommunityMessengerPeerPresence(vm.snapshot.room.peerUserId ?? null, vm.snapshot.peerPresence ?? null);
  /** 1:1 은 0/1, 그룹·오픈은 동시에 입력 중인 다른 참가자 수 */
  const typingPeerCount = useMessengerTypingStore((state) => {
    const roomId = vm.snapshot.room.id.trim().toLowerCase();
    const viewerId = vm.snapshot.viewerUserId ?? "";
    const now = Date.now();
    if (!roomId) return 0;
    if (vm.snapshot.room.roomType === "direct") {
      const peerUserId = vm.snapshot.room.peerUserId ?? "";
      if (!peerUserId) return 0;
      const entry = state.byRoomId[roomId]?.[peerUserId];
      return entry && entry.expiresAt > now ? 1 : 0;
    }
    const bucket = state.byRoomId[roomId] ?? {};
    let n = 0;
    for (const [uid, entry] of Object.entries(bucket)) {
      if (uid === viewerId) continue;
      if (entry.expiresAt > now) n += 1;
    }
    return n;
  });
  const statusLine = useMemo(() => {
    if (vm.snapshot.room.roomType !== "direct") {
      if (typingPeerCount >= 2) return `${typingPeerCount}명이 입력 중...`;
      if (typingPeerCount === 1) return "입력 중...";
      return vm.roomHeaderStatus;
    }
    if (typingPeerCount > 0) return "입력 중...";
    if (peerPresence) {
      return formatPresenceLine(peerPresence.state, peerPresence.lastSeenAt);
    }
    return vm.roomHeaderStatus;
  }, [peerPresence, typingPeerCount, vm.roomHeaderStatus, vm.snapshot.room.roomType]);
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
            <p className="truncate text-[11px] text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!vm.isGroupRoom && communityMessengerRoomIsGloballyUsable(vm.snapshot.room) ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmKind("voice")}
                  disabled={vm.roomUnavailable || vm.outgoingDialLocked}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--cm-room-primary)] transition active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-35"
                  aria-label={vm.t("nav_voice_call_label")}
                >
                  <VoiceCallIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmKind("video")}
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
      {confirmKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={peerLabel}
          kind={confirmKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            const kind = confirmKind;
            if (!kind) return;
            void (async () => {
              const ok = await vm.startManagedDirectCall(kind);
              if (ok) setConfirmKind(null);
            })();
          }}
        />
      ) : null}
    </>
  );
}
