"use client";

import { useCallback, useMemo, useState } from "react";
import { MessengerFriendProfileSheet } from "@/components/community-messenger/MessengerFriendProfileSheet";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  open: boolean;
  onClose: () => void;
  vm: MessengerRoomPhase2ViewModel;
};

/** 1:1 일반 친구 방 헤더 탭 — 프로필 시트(통화만). Home 친구 액션 API 복제 없음. */
export function CommunityMessengerRoomFriendProfileSheetHost({ open, onClose, vm }: Props) {
  const [outgoingConfirmKind, setOutgoingConfirmKind] = useState<null | "voice" | "video">(null);
  const peerUserId = (vm.snapshot.room.peerUserId ?? "").trim();

  const profile = useMemo((): CommunityMessengerProfileLite | null => {
    if (!peerUserId) return null;
    const fromMember = vm.snapshot.members.find((member) => member.id.trim() === peerUserId) ?? null;
    if (fromMember) return fromMember;
    const label = vm.snapshot.room.title?.trim() || peerUserId;
    return {
      id: peerUserId,
      label,
      avatarUrl: vm.snapshot.room.avatarUrl ?? null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
    };
  }, [peerUserId, vm.snapshot.members, vm.snapshot.room.avatarUrl, vm.snapshot.room.title]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if ((!open && !outgoingConfirmKind) || !profile) return null;

  return (
    <>
      {open ? (
        <MessengerFriendProfileSheet
          profile={profile}
          busyId={null}
          context="roomHeader"
          onClose={handleClose}
          onVoiceCall={() => {
            setOutgoingConfirmKind("voice");
          }}
          onVideoCall={() => {
            setOutgoingConfirmKind("video");
          }}
        />
      ) : null}
      {outgoingConfirmKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={profile.label?.trim() || vm.snapshot.room.title?.trim() || ""}
          kind={outgoingConfirmKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setOutgoingConfirmKind(null)}
          onConfirm={() => {
            const kind = outgoingConfirmKind;
            setOutgoingConfirmKind(null);
            handleClose();
            void vm.startManagedDirectCall(kind);
          }}
        />
      ) : null}
    </>
  );
}
