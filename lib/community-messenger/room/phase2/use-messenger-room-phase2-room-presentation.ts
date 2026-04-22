"use client";

import { useMemo } from "react";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import {
  communityMessengerCallSessionIsActiveConnected,
  communityMessengerCallStubStatusIsTerminal,
  communityMessengerRoomIsGloballyUsable,
  type CommunityMessengerMessage,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";
import { getLatestCallStubForSession } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { MessageKey } from "@/lib/i18n/messages";

export type MessengerRoomPhase2RoomPresentationArgs = {
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomId: string;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  callPanel: CommunityMessengerGroupCallHandle["panel"];
};

/**
 * Phase2 컨트롤러에서 분리한 방 헤더·권한·통화 배너 힌트 등 순수 파생 상태(부수효과 없음).
 */
export function useMessengerRoomPhase2RoomPresentation({
  snapshot,
  roomId,
  roomMessages,
  t,
  callPanel,
}: MessengerRoomPhase2RoomPresentationArgs) {
  const tradeSendBlocked = Boolean(snapshot?.tradeMessaging && snapshot.tradeMessaging.canSendMessage === false);
  const roomGloballyBlocked = snapshot ? !communityMessengerRoomIsGloballyUsable(snapshot.room) : true;
  const roomUnavailable = roomGloballyBlocked || tradeSendBlocked;
  const isGroupRoom = snapshot ? snapshot.room.roomType !== "direct" : false;
  /** `summary` 컬럼에 거래/배달 v1 JSON만 들어간 경우 — 공지·소개에 원문 JSON 을 노출하지 않음 */
  const roomSummaryHoldsOnlyTradeOrDeliveryMeta = useMemo(() => {
    const raw = snapshot?.room.summary?.trim();
    if (!raw) return false;
    const k = snapshot?.room.contextMeta?.kind;
    if (k === "trade" || k === "delivery") return true;
    return parseCommunityMessengerRoomContextMeta(raw) != null;
  }, [snapshot?.room.summary, snapshot?.room.contextMeta]);
  const tradeProductChatIdForDock = useMemo(() => {
    const m = snapshot?.room.contextMeta;
    if (!m || m.kind !== "trade") return "";
    return typeof m.productChatId === "string" ? m.productChatId.trim() : "";
  }, [snapshot?.room.contextMeta]);
  const showMessengerTradeProcessDock = !isGroupRoom && tradeProductChatIdForDock.length > 0;
  const permissionGuide = callPanel ? getCommunityMessengerPermissionGuide(callPanel.kind) : null;
  const isPrivateGroupRoom = snapshot?.room.roomType === "private_group";
  const isOpenGroupRoom = snapshot?.room.roomType === "open_group";
  const isOwner = snapshot?.myRole === "owner";
  const roomTypeLabel = isOpenGroupRoom
    ? t("nav_messenger_open_group")
    : isPrivateGroupRoom
      ? t("nav_messenger_private_group")
      : t("nav_messenger_direct_room");
  const roomSubtitle =
    snapshot?.room.description ||
    (isGroupRoom
      ? t("nav_messenger_group_room_subtitle", { count: snapshot?.room.memberCount ?? 0 })
      : t("nav_messenger_friend_room_subtitle"));
  const roomJoinLabel = isOpenGroupRoom
    ? snapshot?.room.joinPolicy === "password"
      ? t("nav_messenger_join_password")
      : t("nav_messenger_join_free")
    : null;
  const roomIdentityLabel = isOpenGroupRoom
    ? snapshot?.room.identityPolicy === "alias_allowed"
      ? t("nav_messenger_identity_alias")
      : t("nav_messenger_identity_real")
    : null;
  /** 비공개·오픈그룹(모임) 모두 `notice_text` 기준. 오픈그룹 소개는 `summary`·설정 화면에서 다룸. */
  const roomNotice =
    snapshot?.room.roomType === "private_group" || snapshot?.room.roomType === "open_group"
      ? snapshot?.room.noticeText?.trim() ?? ""
      : roomSummaryHoldsOnlyTradeOrDeliveryMeta
        ? ""
        : snapshot?.room.summary?.trim() ?? "";
  const canInviteMembers = Boolean(isPrivateGroupRoom && snapshot?.room.allowMemberInvite);
  const myRoleLabel = snapshot
    ? isOwner
      ? t("nav_messenger_owner_label")
      : t("nav_messenger_my_role_label", { role: snapshot.myRole })
    : "";
  const privateGroupNotice = snapshot?.room.noticeText?.trim() ?? "";
  const canEditGroupNotice = Boolean(
    (isPrivateGroupRoom || isOpenGroupRoom) &&
      snapshot &&
      (snapshot.myRole === "owner" || (snapshot.myRole === "admin" && snapshot.room.allowAdminEditNotice))
  );
  const canManageGroupPermissions = Boolean(isPrivateGroupRoom && snapshot?.myRole === "owner");
  const canManageMemberRoles = Boolean(isPrivateGroupRoom && snapshot?.myRole === "owner");
  const canKickGroupMembers = Boolean(
    isPrivateGroupRoom &&
      snapshot &&
      (snapshot.myRole === "owner" || (snapshot.myRole === "admin" && snapshot.room.allowAdminKick))
  );
  const canStartGroupCall = Boolean(
    isGroupRoom &&
      snapshot &&
      communityMessengerRoomIsGloballyUsable(snapshot.room) &&
      (snapshot.myRole === "owner" || snapshot.myRole === "admin" || snapshot.room.allowMemberCall)
  );
  const canUploadAttachments = Boolean(
    !isPrivateGroupRoom ||
      !snapshot ||
      snapshot.myRole === "owner" ||
      snapshot.myRole === "admin" ||
      snapshot.room.allowMemberUpload
  );
  const activeGroupCall = isGroupRoom && snapshot?.activeCall?.sessionMode === "group" ? snapshot.activeCall : null;
  const groupCallStatusLabel = activeGroupCall
    ? activeGroupCall.status === "active"
      ? "그룹 통화 진행 중"
      : activeGroupCall.status === "ringing"
        ? "그룹 통화 연결 중"
        : "그룹 통화 대기"
    : canStartGroupCall
      ? "그룹 통화 시작 가능"
      : isGroupRoom
        ? "그룹 통화 시작 권한 없음"
        : "";
  const privateGroupPermissionRows = useMemo(
    () =>
      snapshot
        ? [
            { label: "일반 멤버 초대", value: snapshot.room.allowMemberInvite ? "허용" : "제한" },
            { label: "관리자 초대", value: snapshot.room.allowAdminInvite ? "허용" : "제한" },
            { label: "관리자 내보내기", value: snapshot.room.allowAdminKick ? "허용" : "제한" },
            { label: "관리자 공지 수정", value: snapshot.room.allowAdminEditNotice ? "허용" : "제한" },
            { label: "일반 멤버 업로드", value: snapshot.room.allowMemberUpload ? "허용" : "제한" },
            { label: "일반 멤버 통화 시작", value: snapshot.room.allowMemberCall ? "허용" : "제한" },
          ]
        : [],
    [snapshot]
  );
  const allowedPrivateGroupPermissionCount = useMemo(
    () => privateGroupPermissionRows.filter((row) => row.value === "허용").length,
    [privateGroupPermissionRows]
  );
  const privateGroupNoticeStatusLabel = privateGroupNotice ? "등록됨" : "없음";

  /** 미니화 힌트(sessionStorage)에 의존하지 않음 — `active`(연결됨)일 때만 배너(벨 울리는 ringing 제외).
   *  채팅 call_stub 이 이미 종료로 갱신됐는데 세션 행이 잠깐 active 로 남는 경우 배너를 숨긴다. */
  const returnToCallSessionId = useMemo(() => {
    const ac = snapshot?.activeCall;
    if (
      ac &&
      ac.sessionMode === "direct" &&
      ac.roomId === roomId &&
      communityMessengerCallSessionIsActiveConnected(ac.status)
    ) {
      const latestStub = getLatestCallStubForSession(roomMessages, ac.id);
      if (latestStub && communityMessengerCallStubStatusIsTerminal(latestStub.callStatus)) {
        return null;
      }
      return ac.id;
    }
    return null;
  }, [roomId, snapshot?.activeCall, roomMessages]);

  const roomHeaderStatus = useMemo(() => {
    if (!snapshot) return "";
    return (
      [roomTypeLabel, roomSubtitle || (isGroupRoom ? `${snapshot.room.memberCount}명` : "마지막 활동 없음")]
        .filter(Boolean)
        .join(" · ") || ""
    );
  }, [snapshot, roomTypeLabel, roomSubtitle, isGroupRoom]);

  return {
    roomUnavailable,
    tradeSendBlocked,
    isGroupRoom,
    roomSummaryHoldsOnlyTradeOrDeliveryMeta,
    tradeProductChatIdForDock,
    showMessengerTradeProcessDock,
    permissionGuide,
    isPrivateGroupRoom,
    isOpenGroupRoom,
    isOwner,
    roomTypeLabel,
    roomSubtitle,
    roomJoinLabel,
    roomIdentityLabel,
    roomNotice,
    canInviteMembers,
    myRoleLabel,
    privateGroupNotice,
    canEditGroupNotice,
    canManageGroupPermissions,
    canManageMemberRoles,
    canKickGroupMembers,
    canStartGroupCall,
    canUploadAttachments,
    activeGroupCall,
    groupCallStatusLabel,
    privateGroupPermissionRows,
    allowedPrivateGroupPermissionCount,
    privateGroupNoticeStatusLabel,
    returnToCallSessionId,
    roomHeaderStatus,
  };
}
