"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerUnknownPeerNoticeBar } from "@/components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  isViewerRecipientOfInboundDirectChat,
  shouldShowUnknownPeerNotice,
} from "@/lib/community-messenger/peer-notices";

const MESSENGER_CHATS_HREF = "/community-messenger?section=chats";

/** 1:1 direct — inbound unsaved peer notice (recipient only, block only); 친구 추가는 승인 흐름에서만 */
export function CommunityMessengerRoomPhase2PeerNotice() {
  const vm = useMessengerRoomPhase2View();
  const router = useRouter();
  const { t } = useI18n();
  const room = vm.snapshot?.room;
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const peerUserId = (room?.peerUserId ?? "").trim();
  const viewerUserId = (vm.snapshot?.viewerUserId ?? "").trim();

  const redirectToChats = useCallback(() => {
    router.replace(MESSENGER_CHATS_HREF);
  }, [router]);

  const confirmBlock = useCallback(async () => {
    if (!peerUserId || !room?.id) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/community-messenger/friends/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerUserId, roomId: room.id, mode: "block_and_hide" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) return;
      setBlockConfirmOpen(false);
      postCommunityMessengerBusEvent({
        type: "cm.home.social_sync",
        roomId: room.id,
        viewerUserId,
        reason: "user_blocked",
        at: Date.now(),
      });
      requestMessengerHubBadgeResync("home_list_merge_summary");
      redirectToChats();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, redirectToChats, room?.id, viewerUserId]);

  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  useEffect(() => {
    if (!peerUserId || room?.relationStatus !== "pending") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/community-messenger/friends/status?peerUserId=${encodeURIComponent(peerUserId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; friendshipId?: string | null };
      if (!cancelled && res.ok && json.ok) {
        setFriendshipId(json.friendshipId?.trim() || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerUserId, room?.relationStatus]);

  const acceptRequest = useCallback(async () => {
    const fid = friendshipId?.trim();
    if (!fid) return;
    setBlockBusy(true);
    try {
      const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(fid)}/accept`, {
        method: "PATCH",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string };
      if (!res.ok || !json.ok) return;
      showMessengerSnackbar(t("cm_ui_friend_accept_success_snackbar"), { variant: "success" });
      postCommunityMessengerBusEvent({
        type: "cm.home.social_sync",
        roomId: json.roomId ?? room?.id,
        viewerUserId,
        reason: "friendship_created",
        at: Date.now(),
      });
      requestMessengerHubBadgeResync("home_list_merge_summary");
      void vm.refresh(true);
    } finally {
      setBlockBusy(false);
    }
  }, [friendshipId, room?.id, t, viewerUserId, vm]);

  const declineRequest = useCallback(async () => {
    const fid = friendshipId?.trim();
    if (!fid) return;
    if (!window.confirm(t("cm_social_decline_request_confirm"))) return;
    setBlockBusy(true);
    try {
      const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(fid)}/decline`, {
        method: "PATCH",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) return;
      postCommunityMessengerBusEvent({
        type: "cm.home.social_sync",
        roomId: room?.id,
        viewerUserId,
        reason: "message_request_declined",
        at: Date.now(),
      });
      requestMessengerHubBadgeResync("home_list_merge_summary");
      redirectToChats();
    } finally {
      setBlockBusy(false);
    }
  }, [friendshipId, redirectToChats, room?.id, t, viewerUserId]);


  const peer =
    vm.snapshot?.members.find((m) => m.id.trim() === peerUserId) ?? null;
  const blockedByMe = Boolean(peer?.blocked);
  const isFriend = Boolean(peer?.isFriend);
  const dismissed = Boolean(vm.snapshot?.unknownPeerNoticeDismissed);
  const isRecipient = isViewerRecipientOfInboundDirectChat({
    viewerUserId,
    peerUserId,
    messages: vm.snapshot?.messages ?? [],
  });

  useEffect(() => {
    if (!room || room.roomType !== "direct") return;
    if (room.contextMeta?.kind === "trade" || room.contextMeta?.kind === "delivery") return;
    if (!peerUserId || !blockedByMe) return;
    redirectToChats();
  }, [blockedByMe, peerUserId, redirectToChats, room]);

  if (!room || room.roomType !== "direct") return null;
  if (room.contextMeta?.kind === "trade" || room.contextMeta?.kind === "delivery") return null;
  if (!peerUserId) return null;
  if (blockedByMe) return null;

  if (room.relationStatus === "pending") {
    return (
      <>
        <MessengerUnknownPeerNoticeBar
          variant={isRecipient ? "request_incoming" : "request_outgoing"}
          busy={Boolean(vm.busy) || blockBusy}
          onAccept={isRecipient && friendshipId ? () => void acceptRequest() : undefined}
          onDecline={isRecipient && friendshipId ? () => void declineRequest() : undefined}
          onBlock={isRecipient ? () => setBlockConfirmOpen(true) : undefined}
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

  if (
    !shouldShowUnknownPeerNotice({
      isFriend,
      blockedByMe,
      dismissed,
      isRecipient,
    })
  ) {
    return null;
  }

  return (
    <>
      <MessengerUnknownPeerNoticeBar
        variant="unsaved"
        busy={Boolean(vm.busy) || blockBusy}
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
