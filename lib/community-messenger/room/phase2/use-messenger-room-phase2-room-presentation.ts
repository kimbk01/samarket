"use client";

import { useMemo } from "react";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { resolveGroupRoomCapabilities } from "@/lib/community-messenger/group/group-room-permissions";
import {
  parseCommunityMessengerRoomContextMeta,
  resolveCommunityMessengerDeliveryContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import { generalFriendDirectRoomGate } from "@/lib/community-messenger/messenger-room-domain";
import { resolveMessengerRoomPhase2DomainChrome } from "@/components/community-messenger/room/phase2/resolve-messenger-room-phase2-domain-chrome";
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
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice } from "@/lib/utils/format";
import {
  formatTradeMarketplacePeerProductTitle,
  resolveTradeWindowCounterpartyRole,
} from "@/lib/community-messenger/room/phase2/marketplace-room-chrome";

/** `summary`·`contextMeta` 가 거래/배달 v1 기계 메타만 담는지 — 친구 1:1 DM legacy 잔재 포함. */
export function roomSummaryIsTradeOrDeliveryContextMetaOnly(input: {
  summary?: string | null;
  contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
}): boolean {
  const raw = input.summary?.trim();
  const k = input.contextMeta?.kind;
  if (k === "trade" || k === "delivery") return true;
  if (!raw) return false;
  return parseCommunityMessengerRoomContextMeta(raw) != null;
}

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
  const isGeneralFriendDirect = Boolean(
    snapshot?.room && generalFriendDirectRoomGate(snapshot.room, snapshot.viewerUserId)
  );
  const tradeSendBlocked =
    !isGeneralFriendDirect &&
    Boolean(snapshot?.tradeMessaging && snapshot.tradeMessaging.canSendMessage === false);
  const roomGloballyBlocked = snapshot ? !communityMessengerRoomIsGloballyUsable(snapshot.room) : true;
  const roomUnavailable = roomGloballyBlocked || tradeSendBlocked;
  const isGroupRoom = snapshot ? snapshot.room.roomType !== "direct" : false;
  /** `summary` 컬럼에 거래/배달 v1 JSON만 들어간 경우 — 공지·소개에 원문 JSON 을 노출하지 않음 */
  const roomSummaryHoldsOnlyTradeOrDeliveryMeta = useMemo(
    () =>
      roomSummaryIsTradeOrDeliveryContextMetaOnly({
        summary: snapshot?.room.summary,
        contextMeta: snapshot?.room.contextMeta,
      }),
    [snapshot?.room.summary, snapshot?.room.contextMeta]
  );
  const tradeProductChatIdForDock = useMemo(() => {
    if (isGeneralFriendDirect) return "";
    const m = snapshot?.room.contextMeta;
    if (!m || m.kind !== "trade") return "";
    return typeof m.productChatId === "string" ? m.productChatId.trim() : "";
  }, [isGeneralFriendDirect, snapshot?.room.contextMeta]);
  const showMessengerTradeProcessDock = !isGroupRoom && tradeProductChatIdForDock.length > 0;
  const deliveryContextMeta = useMemo(
    () =>
      isGeneralFriendDirect || !snapshot?.room
        ? null
        : resolveCommunityMessengerDeliveryContextMeta(snapshot.room),
    [isGeneralFriendDirect, snapshot?.room.contextMeta, snapshot?.room.messengerDirectKey, snapshot?.room.summary]
  );
  const storeOrderIdForDock = useMemo(() => {
    const id = deliveryContextMeta?.storeOrderId;
    return typeof id === "string" ? id.trim() : "";
  }, [deliveryContextMeta?.storeOrderId]);
  const storeIdForDock = useMemo(() => {
    const id = deliveryContextMeta?.storeId;
    return typeof id === "string" ? id.trim() : "";
  }, [deliveryContextMeta?.storeId]);
  const showMessengerStoreOrderDock = !isGroupRoom && storeOrderIdForDock.length > 0;
  const permissionGuide = callPanel ? getCommunityMessengerPermissionGuide(callPanel.kind) : null;
  const isPrivateGroupRoom = snapshot?.room.roomType === "private_group";
  const isOpenGroupRoom = snapshot?.room.roomType === "open_group";
  const isOwner = snapshot?.myRole === "owner";
  const domainChromePresentation = useMemo(() => {
    if (!snapshot?.room) return null;
    const tradeProductTitle =
      snapshot.tradeChatRoomDetail?.product?.title?.trim() ||
      (snapshot.room.contextMeta?.kind === "trade" ? snapshot.room.contextMeta.headline?.trim() : "") ||
      null;
    return resolveMessengerRoomPhase2DomainChrome({
      room: snapshot.room,
      viewerUserId: snapshot.viewerUserId,
      myRole: snapshot.myRole,
      tradeProductTitle,
      storeOrderId: storeOrderIdForDock || null,
      orderStatusLabel: null,
      t,
    });
  }, [
    snapshot?.room,
    snapshot?.viewerUserId,
    snapshot?.myRole,
    snapshot?.tradeChatRoomDetail?.product?.title,
    storeOrderIdForDock,
    t,
  ]);
  const tradeListingHeader = useMemo(() => {
    if (!snapshot?.room || domainChromePresentation?.chrome.profileKind !== "listing") return null;
    const product = snapshot.tradeChatRoomDetail?.product;
    const title =
      domainChromePresentation.headerPrimaryText?.trim() ||
      product?.title?.trim() ||
      t("nav_trade_product_fallback");
    const fromDetail = product?.thumbnail?.trim() || "";
    const fromMeta =
      snapshot.room.contextMeta?.kind === "trade"
        ? snapshot.room.contextMeta.thumbnailUrl?.trim() || ""
        : "";
    const imageUrl = fromDetail || fromMeta || null;
    const peerLabel =
      domainChromePresentation.headerSecondaryText?.trim() ||
      snapshot.room.title?.trim() ||
      null;
    const counterpartyRole = resolveTradeWindowCounterpartyRole({
      viewerUserId: snapshot.viewerUserId,
      sellerUserId: snapshot.tradeChatRoomDetail?.sellerId,
      buyerUserId: snapshot.tradeChatRoomDetail?.buyerId,
    });
    const postId = product?.id?.trim() || (snapshot.room.contextMeta?.kind === "trade" ? snapshot.room.contextMeta.postId?.trim() : "") || "";
    const detailHref = product?.detailHref?.trim() || (postId ? `/post/${postId}` : null);
    const currency = getAppSettings().defaultCurrency ?? "PHP";
    const priceRaw = product?.price;
    const priceLabel =
      typeof priceRaw === "number" && Number.isFinite(priceRaw) ? formatPrice(priceRaw, currency) : null;
    return {
      title,
      imageUrl,
      peerLabel,
      headerTitle: formatTradeMarketplacePeerProductTitle(peerLabel, title),
      counterpartyRole,
      priceLabel,
      detailHref,
    };
  }, [
    domainChromePresentation?.chrome.profileKind,
    domainChromePresentation?.headerPrimaryText,
    domainChromePresentation?.headerSecondaryText,
    snapshot?.room,
    snapshot?.viewerUserId,
    snapshot?.tradeChatRoomDetail?.sellerId,
    snapshot?.tradeChatRoomDetail?.buyerId,
    snapshot?.tradeChatRoomDetail?.product,
    t,
  ]);

  const roomTypeLabel =
    domainChromePresentation?.roomTypeLabel ??
    (isOpenGroupRoom
      ? t("nav_messenger_open_group")
      : isPrivateGroupRoom
        ? t("nav_messenger_private_group")
        : t("nav_messenger_direct_room"));
  const showTimelineMemberCountSuffix = domainChromePresentation?.showTimelineMemberCountSuffix ?? false;
  const timelineMemberCount = domainChromePresentation?.timelineMemberCount ?? 0;
  const roomSubtitle = isGroupRoom
    ? typeof snapshot?.room.onlineCount === "number"
      ? t("cm_ui_group_members_online_line", {
          memberCount: snapshot?.room.memberCount ?? 0,
          onlineCount: snapshot.room.onlineCount,
        })
      : snapshot?.room.description ||
        t("nav_messenger_group_room_subtitle", { count: snapshot?.room.memberCount ?? 0 })
    : snapshot?.room.description || t("nav_messenger_friend_room_subtitle");
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
  const groupCaps =
    snapshot && (isPrivateGroupRoom || isOpenGroupRoom)
      ? resolveGroupRoomCapabilities({
          viewerUserId: snapshot.viewerUserId,
          viewerRole: (snapshot.myRole === "owner" || snapshot.myRole === "admin"
            ? snapshot.myRole
            : "member") as "owner" | "admin" | "member",
          room: {
            owner_user_id: snapshot.room.ownerUserId ?? null,
            allow_member_invite: snapshot.room.allowMemberInvite ?? true,
            allow_admin_invite: snapshot.room.allowAdminInvite ?? true,
            allow_admin_kick: snapshot.room.allowAdminKick ?? true,
            allow_admin_edit_notice: snapshot.room.allowAdminEditNotice ?? true,
          },
        })
      : null;
  const canInviteMembers = Boolean(isPrivateGroupRoom && groupCaps?.canInviteMembers);
  const myRoleLabel = snapshot
    ? isOwner
      ? t("nav_messenger_owner_label")
      : t("nav_messenger_my_role_label", { role: snapshot.myRole })
    : "";
  const privateGroupNotice = snapshot?.room.noticeText?.trim() ?? "";
  const canEditGroupNotice = Boolean(
    (isPrivateGroupRoom || isOpenGroupRoom) && groupCaps?.canEditNotice
  );
  const canEditPrivateGroupMeta = Boolean(isPrivateGroupRoom && groupCaps?.canEditGroupInfo);
  const canPinGroupMessage = canEditPrivateGroupMeta;
  const canManageGroupPermissions = Boolean(isPrivateGroupRoom && groupCaps?.canUpdatePermissions);
  const canManageMemberRoles = Boolean(
    isPrivateGroupRoom && (groupCaps?.canPromoteMember || groupCaps?.canDemoteAdmin)
  );
  const canKickGroupMembers = Boolean(isPrivateGroupRoom && groupCaps?.canKickMembers);
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
    if (isGroupRoom) {
      // Telegram-style Members · Online; typing wins in Header statusLine
      return (
        roomSubtitle ||
        (typeof snapshot.room.onlineCount === "number"
          ? t("cm_ui_group_members_online_line", {
              memberCount: snapshot.room.memberCount,
              onlineCount: snapshot.room.onlineCount,
            })
          : `${snapshot.room.memberCount}`)
      );
    }
    const chromeSecondary = domainChromePresentation?.headerSecondaryText?.trim();
    if (chromeSecondary) return chromeSecondary;
    return (
      [roomTypeLabel, roomSubtitle || "마지막 활동 없음"].filter(Boolean).join(" · ") || ""
    );
  }, [domainChromePresentation?.headerSecondaryText, snapshot, roomTypeLabel, roomSubtitle, isGroupRoom, t]);

  return {
    roomUnavailable,
    tradeSendBlocked,
    isGroupRoom,
    roomSummaryHoldsOnlyTradeOrDeliveryMeta,
    tradeProductChatIdForDock,
    showMessengerTradeProcessDock,
    storeOrderIdForDock,
    storeIdForDock,
    showMessengerStoreOrderDock,
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
    canEditPrivateGroupMeta,
    canPinGroupMessage,
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
    showTimelineMemberCountSuffix,
    timelineMemberCount,
    tradeListingHeader,
  };
}
