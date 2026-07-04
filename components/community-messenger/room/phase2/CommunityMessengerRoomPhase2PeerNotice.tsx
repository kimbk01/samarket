"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import {
  resolveDirectChatInboundRecipient,
  resolvePeerNoticeBranch,
} from "@/components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic";
import { MessengerUnknownPeerNoticeBar } from "@/components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { generalFriendDirectRoomGate } from "@/lib/community-messenger/messenger-room-domain";
import { refreshMessengerHomeSocialClient } from "@/lib/community-messenger/home/refresh-messenger-home-social-client";
import { patchRoomSnapshotAfterFriendshipAccepted } from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const MESSENGER_CHATS_HREF = "/community-messenger?section=chats";

/** 1:1 direct — Contact transition P2: recipient Add Contact + Block; initiator hidden */
export function CommunityMessengerRoomPhase2PeerNotice() {
  const vm = useMessengerRoomPhase2View();
  const router = useRouter();
  const { t } = useI18n();
  const room = vm.snapshot?.room;
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);

  const peerUserId = (room?.peerUserId ?? "").trim();
  const peer =
    vm.snapshot?.members.find((m) => m.id.trim() === peerUserId) ?? null;
  const blockedByMe = Boolean(peer?.blocked);
  const blockedByPeer = Boolean(
    vm.snapshot?.members.find((m) => m.id.trim() === peerUserId)?.blocked
  );

  const relationLabel: PeerRelationLabel =
    vm.snapshot?.peerRelationLabel ??
    vm.snapshot?.directCallGate?.relationLabel ??
    (vm.snapshot?.peerFriendshipState === "accepted" || peer?.isFriend ? "mutual_friend" : "stranger");

  const isGeneralFriendDirect = Boolean(
    room && generalFriendDirectRoomGate(room, vm.snapshot?.viewerUserId)
  );

  const peerFriendshipState = vm.snapshot?.peerFriendshipState;
  const viewerUserId = vm.snapshot?.viewerUserId ?? "";

  const timelineMessages = useMemo(() => {
    const fromRoom = vm.roomMessages ?? [];
    if (fromRoom.length > 0) {
      return fromRoom.map((m) => ({
        senderId: m.senderId,
        messageType: m.messageType,
        createdAt: m.createdAt,
      }));
    }
    return (vm.snapshot?.messages ?? []).map((m) => ({
      senderId: m.senderId,
      messageType: m.messageType,
      createdAt: m.createdAt,
    }));
  }, [vm.roomMessages, vm.snapshot?.messages]);

  const isInboundRecipient = useMemo(
    () =>
      resolveDirectChatInboundRecipient({
        viewerUserId,
        peerUserId,
        roomOwnerUserId: room?.ownerUserId,
        messages: timelineMessages,
      }),
    [peerUserId, room?.ownerUserId, timelineMessages, viewerUserId]
  );

  const branch = useMemo(
    () =>
      resolvePeerNoticeBranch({
        isGeneralFriendDirect,
        roomType: room?.roomType ?? "",
        peerUserId,
        blockedByMe,
        blockedByPeer,
        peerFriendshipState,
        peerRelationLabel: relationLabel,
        isInboundRecipient,
      }),
    [
      blockedByMe,
      blockedByPeer,
      isGeneralFriendDirect,
      isInboundRecipient,
      peerFriendshipState,
      peerUserId,
      relationLabel,
      room?.roomType,
    ]
  );

  const redirectToChats = useCallback(() => {
    router.replace(MESSENGER_CHATS_HREF);
  }, [router]);

  const confirmBlock = useCallback(async () => {
    if (!peerUserId || !room?.id) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/community-messenger/relations/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerUserId, roomId: room.id, blockSource: "chat_room" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) return;
      setBlockConfirmOpen(false);
      redirectToChats();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, redirectToChats, room?.id]);

  const confirmUnblock = useCallback(async () => {
    if (!peerUserId) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/community-messenger/relations/block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerUserId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        showMessengerSnackbar(t("cm_social_unblock_failed"), { variant: "error" });
        return;
      }
      showMessengerSnackbar(t("cm_social_unblock_success"), { variant: "success" });
      router.refresh();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, router, t]);

  const onAddContact = useCallback(async () => {
    if (!peerUserId) return;
    setFriendBusy(true);
    try {
      const result = await postCommunityMessengerFriendRequestApi(peerUserId);
      if (!result.ok) {
        showMessengerSnackbar(t("cm_ui_friend_request_send_failed"), { variant: "error" });
        return;
      }
      showMessengerSnackbar(t("cm_social_add_friend"), { variant: "success" });
      vm.setSnapshot((prev) =>
        prev && peerUserId ? patchRoomSnapshotAfterFriendshipAccepted(prev, peerUserId) : prev
      );
      void refreshMessengerHomeSocialClient("room_friend_request_outcome");
      void vm.refresh(true);
    } finally {
      setFriendBusy(false);
    }
  }, [peerUserId, t, vm]);

  if (branch === "none") return null;

  if (branch === "blocked") {
    return (
      <MessengerUnknownPeerNoticeBar
        variant="blocked_by_me"
        busy={blockBusy}
        onUnblock={() => void confirmUnblock()}
      />
    );
  }

  return (
    <>
      <MessengerUnknownPeerNoticeBar
        variant="stranger"
        busy={Boolean(vm.busy) || blockBusy || friendBusy}
        onAddFriend={() => void onAddContact()}
        onBlock={() => setBlockConfirmOpen(true)}
      />
      <MessengerBlockPeerConfirmModal
        open={blockConfirmOpen}
        busy={blockBusy}
        onCancel={() => setBlockConfirmOpen(false)}
        onConfirm={() => void confirmBlock()}
      />
    </>
  );
}
