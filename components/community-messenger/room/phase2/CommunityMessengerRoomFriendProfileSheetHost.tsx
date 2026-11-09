"use client";

import { useCallback, useMemo, useState } from "react";
import { MessengerFriendProfileSheet } from "@/components/community-messenger/MessengerFriendProfileSheet";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { DibayConfirmDialogProps } from "@/components/ui/dibay-overlay";

type _OverlaySsotHost = DibayConfirmDialogProps;

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

  /**
   * F3: 발신 확인창·발신 화면 공용 이름 — 매장 주문 구매자는 매장명, 아니면 실제 프로필 이름·방 제목.
   * `profile.label` 의 회원 ID 대체값(peerUserId)은 발신 이름으로 쓰지 않는다(빈 값 → 서버 닉네임).
   */
  const profileLabel = profile?.label?.trim() ?? "";
  const profileDialPeerLabel =
    vm.storeOrderBuyerDialPeerLabel ?? (profileLabel && profileLabel !== peerUserId ? profileLabel : "");

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
          peerLabel={profileDialPeerLabel}
          kind={outgoingConfirmKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setOutgoingConfirmKind(null)}
          onConfirm={() => {
            const kind = outgoingConfirmKind;
            setOutgoingConfirmKind(null);
            handleClose();
            /** F3: 확인창 이름 그대로 발신 */
            void vm.startManagedDirectCall(kind, profileDialPeerLabel);
          }}
        />
      ) : null}
    </>
  );
}
