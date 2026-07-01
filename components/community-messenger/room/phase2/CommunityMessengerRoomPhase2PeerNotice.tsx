"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { resolvePeerNoticeBranch } from "@/components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic";
import { MessengerUnknownPeerNoticeBar } from "@/components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { generalFriendDirectRoomGate } from "@/lib/community-messenger/messenger-room-domain";
import { refreshMessengerHomeSocialClient } from "@/lib/community-messenger/home/refresh-messenger-home-social-client";
import {
  patchRoomSnapshotAfterFriendshipAccepted,
  patchRoomSnapshotAfterFriendshipOutgoingPending,
} from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const MESSENGER_CHATS_HREF = "/community-messenger?section=chats";

/** 1:1 direct — Kakao-style stranger / blocked peer notice + pending incoming accept/reject */
export function CommunityMessengerRoomPhase2PeerNotice() {
  const vm = useMessengerRoomPhase2View();
  const router = useRouter();
  const { t } = useI18n();
  const room = vm.snapshot?.room;
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

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

  const friendshipDirection = vm.snapshot?.friendshipDirection;

  const branch = useMemo(
    () =>
      resolvePeerNoticeBranch({
        isGeneralFriendDirect,
        roomType: room?.roomType ?? "",
        peerUserId,
        blockedByMe,
        blockedByPeer,
        peerFriendshipState,
        friendshipDirection,
        peerRelationLabel: relationLabel,
      }),
    [
      blockedByMe,
      blockedByPeer,
      friendshipDirection,
      isGeneralFriendDirect,
      peerFriendshipState,
      peerUserId,
      relationLabel,
      room?.roomType,
    ]
  );

  const snapshotPendingRequestId = vm.snapshot?.pendingFriendshipRequestId?.trim() ?? null;

  const shouldProbeIncomingRequest =
    isGeneralFriendDirect &&
    Boolean(peerUserId) &&
    !blockedByMe &&
    friendshipDirection === "incoming_pending" &&
    !snapshotPendingRequestId;

  useEffect(() => {
    if (!shouldProbeIncomingRequest) {
      setPendingRequestId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-messenger/friend-requests");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          requests?: CommunityMessengerFriendRequest[];
        };
        if (!res.ok || !json.ok || cancelled) return;
        const match = (json.requests ?? []).find(
          (request) =>
            request.status === "pending" &&
            request.direction === "incoming" &&
            request.requesterId.trim() === peerUserId
        );
        if (!cancelled) setPendingRequestId(match?.id?.trim() ?? null);
      } catch {
        if (!cancelled) setPendingRequestId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerUserId, shouldProbeIncomingRequest]);

  const effectivePendingRequestId = snapshotPendingRequestId ?? pendingRequestId;

  const effectiveBranch = useMemo(() => {
    if (branch === "blocked" || branch === "pending_outgoing_hidden") return branch;
    if (
      effectivePendingRequestId &&
      isGeneralFriendDirect &&
      !blockedByMe &&
      friendshipDirection === "incoming_pending"
    ) {
      return "pending_incoming" as const;
    }
    return branch;
  }, [blockedByMe, branch, effectivePendingRequestId, friendshipDirection, isGeneralFriendDirect]);

  const refreshAfterFriendRequestOutcome = useCallback(async () => {
    await refreshMessengerHomeSocialClient("room_friend_request_outcome");
    await vm.refresh(true);
    router.refresh();
  }, [router, vm]);

  const respondPendingRequest = useCallback(
    async (action: "accept" | "reject") => {
      const requestId = effectivePendingRequestId?.trim();
      const requesterUserId = peerUserId?.trim();
      if (!requestId && !requesterUserId) return;
      setRespondBusy(true);
      try {
        const res = requestId
          ? await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            })
          : await fetch("/api/community-messenger/friend-requests/respond-incoming", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterUserId, action }),
            });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(t("cm_ui_friend_request_respond_failed"), { variant: "error" });
          return;
        }
        if (action === "accept") {
          showMessengerSnackbar(t("cm_ui_friend_merged_incoming_snackbar"), { variant: "success" });
          vm.setSnapshot((prev) =>
            prev && peerUserId ? patchRoomSnapshotAfterFriendshipAccepted(prev, peerUserId) : prev
          );
        }
        await refreshAfterFriendRequestOutcome();
      } catch {
        showMessengerSnackbar(t("cm_ui_friend_request_respond_failed"), { variant: "error" });
      } finally {
        setRespondBusy(false);
      }
    },
    [peerUserId, effectivePendingRequestId, refreshAfterFriendRequestOutcome, t, vm]
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
      vm.setSnapshot((prev) =>
        prev
          ? patchRoomSnapshotAfterFriendshipOutgoingPending(prev, {
              pendingFriendshipRequestId: result.request?.id,
            })
          : prev
      );
      void refreshMessengerHomeSocialClient("room_friend_request_outcome");
      void vm.refresh(true);
    } finally {
      setFriendBusy(false);
    }
  }, [peerUserId, t, vm]);

  if (effectiveBranch === "none" || effectiveBranch === "pending_outgoing_hidden") return null;

  if (effectiveBranch === "blocked") {
    return (
      <MessengerUnknownPeerNoticeBar
        variant="blocked_by_me"
        busy={blockBusy}
        onUnblock={() => void confirmUnblock()}
      />
    );
  }

  if (effectiveBranch === "pending_incoming") {
    return (
      <MessengerUnknownPeerNoticeBar
        variant="pending_incoming"
        busy={respondBusy}
        onAccept={() => void respondPendingRequest("accept")}
        onReject={() => void respondPendingRequest("reject")}
      />
    );
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
