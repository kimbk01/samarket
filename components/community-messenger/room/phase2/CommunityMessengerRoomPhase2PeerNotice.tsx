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
import {
  communityMessengerFriendRequestFailureMessage,
  postCommunityMessengerFriendRequestApi,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { generalFriendDirectRoomGate } from "@/lib/community-messenger/messenger-room-domain";
import { refreshMessengerHomeSocialClient } from "@/lib/community-messenger/home/refresh-messenger-home-social-client";
import { applyMessengerHomeRoomsHiddenByBlock } from "@/lib/community-messenger/home/messenger-home-room-leave-client";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";

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
        directMessageDenied: vm.snapshot?.directMessageDenied,
      }),
    [
      vm.snapshot?.directMessageDenied,
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
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; hiddenRoomIds?: unknown };
      if (!res.ok || !json.ok) {
        /** F-8 — 차단 실패 스낵바 · 서버 원문 비노출 */
        showMessengerSnackbar(t("cm_social_block_failed"), { variant: "error" });
        return;
      }
      setBlockConfirmOpen(false);
      /** §17 R-1: 숨겨진 방을 홈 목록·캐시에서 즉시 제거 */
      applyMessengerHomeRoomsHiddenByBlock(json.hiddenRoomIds);
      /** §15-3: 홈 차단 목록 갱신 → 목록 「대화·통화 불가」 배지 */
      void refreshMessengerHomeSocialClient("room_friend_request_outcome");
      redirectToChats();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, redirectToChats, room?.id, t]);

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
      void refreshMessengerHomeSocialClient("room_friend_request_outcome");
      /** 방 스냅샷의 차단 값(§15-3)을 서버에서 다시 받아 바를 「친구 아님」으로 */
      void vm.refresh(true);
      router.refresh();
    } finally {
      setBlockBusy(false);
    }
  }, [peerUserId, router, t, vm]);

  const onAddContact = useCallback(async () => {
    if (!peerUserId) return;
    setFriendBusy(true);
    try {
      const result = await postCommunityMessengerFriendRequestApi(peerUserId);
      if (!result.ok) {
        showMessengerSnackbar(
          communityMessengerFriendRequestFailureMessage(result) ?? t("cm_ui_friend_request_send_failed"),
          { variant: "error" }
        );
        if (result.error === "incoming_request_exists" || result.error === "already_requested") {
          void vm.refresh(true);
        }
        return;
      }
      /** 상호 친구 — 요청만 보낸 상태(pending). 상대가 수락하기 전에는 친구로 표시하지 않는다. */
      showMessengerSnackbar(t("cm_friend_request_sent"), { variant: "success" });
      vm.setSnapshot((prev) => (prev ? { ...prev, peerFriendshipState: "pending" } : prev));
      void refreshMessengerHomeSocialClient("room_friend_request_outcome");
      void vm.refresh(true);
    } finally {
      setFriendBusy(false);
    }
  }, [peerUserId, t, vm]);

  /**
   * §17 R-2: 받은·보낸 친구 요청 처리 — 서버 방 스냅샷의 pendingFriendshipRequestId 사용.
   * 성공 시 화면 상태를 바로 바꾸고 홈·방을 서버와 다시 맞춘다.
   */
  const pendingRequestId = (vm.snapshot?.pendingFriendshipRequestId ?? "").trim();
  const peerLabel = peer?.label?.trim() || "";
  const respondPendingRequest = useCallback(
    async (action: "accept" | "reject" | "cancel") => {
      if (!pendingRequestId) return;
      if (action === "cancel") {
        const ok = await dibayConfirm({
          title: t("cm_friend_cancel_confirm_title"),
          description: t("cm_friend_cancel_confirm_body", { name: peerLabel || t("cm_peer_notice_peer_fallback") }),
          cancelLabel: t("cm_friend_cancel_confirm_keep"),
          confirmLabel: t("cm_friend_cta_cancel"),
          confirmTone: "destructive",
        });
        if (!ok) return;
      }
      setFriendBusy(true);
      try {
        const res = await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(pendingRequestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(
            json.error === "request_not_pending" || json.error === "not_pending"
              ? t("cm_friend_request_no_longer_pending")
              : action === "cancel"
                ? t("cm_friend_request_cancel_failed")
                : t("cm_friend_request_respond_failed"),
            { variant: "error" }
          );
          void vm.refresh(true);
          return;
        }
        const name = peerLabel || t("cm_peer_notice_peer_fallback");
        showMessengerSnackbar(
          action === "accept"
            ? t("cm_friend_request_you_accepted", { name })
            : action === "reject"
              ? t("cm_friend_request_you_rejected", { name })
              : t("cm_friend_request_cancelled"),
          { variant: action === "accept" ? "success" : "default" }
        );
        vm.setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                peerFriendshipState: action === "accept" ? "accepted" : "none",
                friendshipDirection: action === "accept" ? "mutual_accepted" : "none",
                pendingFriendshipRequestId: undefined,
              }
            : prev
        );
        void refreshMessengerHomeSocialClient("room_friend_request_outcome");
        void vm.refresh(true);
      } finally {
        setFriendBusy(false);
      }
    },
    [peerLabel, pendingRequestId, t, vm]
  );

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

  if (branch === "rejected_by_peer") {
    return <MessengerUnknownPeerNoticeBar variant="rejected_by_peer" />;
  }

  /** §17 R-2: 받은 요청 = [수락]·[거절]·차단, 보낸 요청 = [요청 취소]·[차단] (서버 스냅샷 방향 기준) */
  const incomingPending =
    peerFriendshipState === "pending" && vm.snapshot?.friendshipDirection === "incoming_pending";
  const outgoingPending = peerFriendshipState === "pending" && !incomingPending;

  return (
    <>
      <MessengerUnknownPeerNoticeBar
        variant={incomingPending ? "incoming_request" : outgoingPending ? "pending" : "stranger"}
        busy={Boolean(vm.busy) || blockBusy || friendBusy}
        peerName={peerLabel}
        onAcceptRequest={incomingPending && pendingRequestId ? () => void respondPendingRequest("accept") : undefined}
        onRejectRequest={incomingPending && pendingRequestId ? () => void respondPendingRequest("reject") : undefined}
        onCancelRequest={outgoingPending && pendingRequestId ? () => void respondPendingRequest("cancel") : undefined}
        onAddFriend={peerFriendshipState === "pending" ? undefined : () => void onAddContact()}
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
