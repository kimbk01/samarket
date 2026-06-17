"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerUnknownPeerNoticeBar } from "@/components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { shouldShowUnknownPeerNotice } from "@/lib/community-messenger/peer-notices";

const MESSENGER_CHATS_HREF = "/community-messenger?section=chats";

/** 1:1 general direct room — unsaved peer notice; block hides room and exits. */
export function CommunityMessengerRoomPhase2PeerNotice() {
  const vm = useMessengerRoomPhase2View();
  const router = useRouter();
  const room = vm.snapshot?.room;
  const [dismissedLocal, setDismissedLocal] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const peerUserId = (room?.peerUserId ?? "").trim();

  const redirectToChats = useCallback(() => {
    router.replace(MESSENGER_CHATS_HREF);
  }, [router]);

  const onAddFriend = useCallback(async () => {
    if (!peerUserId) return;
    const res = await fetch("/api/community-messenger/relations/friend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: peerUserId }),
    });
    if (res.ok) void vm.refresh(true);
  }, [peerUserId, vm]);

  const onDismiss = useCallback(async () => {
    if (!peerUserId || !room?.id) return;
    setDismissedLocal(true);
    const res = await fetch("/api/community-messenger/peer-notices/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: room.id,
        peerUserId,
        noticeType: "unknown_peer",
      }),
    });
    if (!res.ok) {
      setDismissedLocal(false);
      return;
    }
    void vm.refresh(true);
  }, [peerUserId, room?.id, vm]);

  const confirmBlock = useCallback(async () => {
    if (!peerUserId || !room?.id) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/community-messenger/relations/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerUserId, roomId: room.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) return;
      setBlockConfirmOpen(false);
      redirectToChats();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, redirectToChats, room?.id]);

  const peer =
    vm.snapshot?.members.find((m) => m.id.trim() === peerUserId) ?? null;
  const blockedByMe = Boolean(peer?.blocked);
  const isFriend = Boolean(peer?.isFriend);
  const dismissed =
    dismissedLocal || Boolean(vm.snapshot?.unknownPeerNoticeDismissed);

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

  if (
    !shouldShowUnknownPeerNotice({
      isFriend,
      blockedByMe,
      dismissed,
    })
  ) {
    return null;
  }

  return (
    <>
      <MessengerUnknownPeerNoticeBar
        variant="unsaved"
        busy={Boolean(vm.busy) || blockBusy}
        onAddFriend={onAddFriend}
        onDismiss={onDismiss}
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
