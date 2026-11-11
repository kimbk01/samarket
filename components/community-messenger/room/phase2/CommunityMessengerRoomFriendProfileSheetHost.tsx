"use client";

import { useCallback, useMemo } from "react";
import { MessengerFriendProfileSheet } from "@/components/community-messenger/MessengerFriendProfileSheet";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { DibayConfirmDialogProps } from "@/components/ui/dibay-overlay";

type _OverlaySsotHost = DibayConfirmDialogProps;

type Props = {
  open: boolean;
  onClose: () => void;
  vm: MessengerRoomPhase2ViewModel;
};

/**
 * 1:1 일반 친구 방 헤더 이름 탭 — 프로필 보기. Home 친구 액션 API 복제 없음.
 * 통화 버튼은 두지 않는다 — 방 안 통화는 헤더 📞 선택 시트 하나 (통화 버튼 통합 2판 · Owner 2026-11-12).
 */
export function CommunityMessengerRoomFriendProfileSheetHost({ open, onClose, vm }: Props) {
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

  if (!open || !profile) return null;

  return <MessengerFriendProfileSheet profile={profile} busyId={null} context="roomHeader" onClose={handleClose} />;
}
