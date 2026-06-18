"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerUnknownPeerNoticeBar } from "@/components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { shouldShowStrangerPeerNotice } from "@/lib/community-messenger/peer-notices";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const MESSENGER_CHATS_HREF = "/community-messenger?section=chats";

/** 1:1 direct — Kakao-style stranger / blocked peer notice */
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
  }, [peerUserId]);

  const onAddFriend = useCallback(async () => {
    if (!peerUserId) return;
    setFriendBusy(true);
    try {
      const result = await postCommunityMessengerFriendRequestApi(peerUserId);
      if (!result.ok) {
        showMessengerSnackbar(t("cm_ui_friend_request_send_failed"), { variant: "error" });
        return;
      }
      showMessengerSnackbar(t("cm_ui_sent_friend_request"), { variant: "success" });
    } finally {
      setFriendBusy(false);
    }
  }, [peerUserId, redirectToChats, router, t]);

  if (!room || room.roomType !== "direct") return null;
  if (room.contextMeta?.kind === "trade" || room.contextMeta?.kind === "delivery") return null;
  if (!peerUserId) return null;

  if (blockedByMe) {
    return (
      <MessengerUnknownPeerNoticeBar
        variant="blocked_by_me"
        busy={blockBusy}
        onUnblock={() => void confirmUnblock()}
      />
    );
  }

  if (
    !shouldShowStrangerPeerNotice({
      relationLabel,
      blockedByMe,
      blockedByPeer,
    })
  ) {
    return null;
  }

  return (
    <>
      <MessengerUnknownPeerNoticeBar
        variant="stranger"
        busy={Boolean(vm.busy) || blockBusy || friendBusy}
        onAddFriend={() => void onAddFriend()}
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
