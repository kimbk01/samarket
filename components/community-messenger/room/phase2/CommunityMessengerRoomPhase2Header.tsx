"use client";

import { useOwnLiveCall } from "@/lib/call/own-live-call";
import { memo, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { BackIcon, MoreIcon } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { useMessengerRoomPhase2HeaderView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-header-context";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import {
  resolveMessengerRoomBackNavigation,
  runMessengerRoomBackNavigation,
} from "@/lib/community-messenger/room/messenger-room-back-navigation";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { MessengerHeader } from "@/components/community-messenger/line-ui";
import { Phone, Search, Settings, X } from "lucide-react";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import { useMessengerRoomAnimatedBack } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { noteCmRoomPass1HeaderMs } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { useCmRoomPhase2HydrationPass } from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GroupDomainAvatar } from "@/components/community-messenger/domain-shell-canary/GroupDomainAvatar";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { translate } from "@/lib/i18n/messages";
import { useOwnerOrderChatSlideHost } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { useBuyerOrderChatSlideHost } from "@/components/mypage/BuyerOrderChatSlideHostContext";
import {
  formatDeliveryMessengerPresenceIndustrySubtitle,
  resolveStoreOrderBuyerVoicePeerLabel,
  roomShowsStoreOrderWindowHeader,
} from "@/lib/store-order-chat/messenger-delivery-room-header";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";
import { StoreOrderDeliveryMessengerHeaderBlock } from "@/components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock";
import { useTradePostDetailSlideHost } from "@/components/community-messenger/room/phase2/TradePostDetailSlideHostContext";
import {
  generalFriendDirectRoomGate,
  messengerRoomShowsConfirmedDeliveryPresentation,
  messengerRoomShowsConfirmedTradePresentation,
  resolveMessengerDotMenuCallKind,
  resolveMessengerDotMenuCallVisibility,
} from "@/lib/community-messenger/messenger-room-domain";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import {
  normalizeTradeChatCallPolicy,
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
} from "@/lib/trade/trade-chat-call-policy";
import { logCallV3ButtonClick, logCallV3ButtonRender } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

/**
 * 방 헤더 아이콘 — 보이는 원 36px(기존 그대로) · 터치 44×44 (04-DESIGN-SYSTEM Touch, T-01).
 * 눌림 배경은 안쪽 36px 원에만 (group-active) → 시각 변화 없음.
 */
const CM_ROOM_HEADER_TOUCH_BTN_CLASS =
  "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full";
const CM_ROOM_HEADER_TOUCH_FACE_BASE_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-full transition";
const CM_ROOM_HEADER_TOUCH_FACE_CLASS = `${CM_ROOM_HEADER_TOUCH_FACE_BASE_CLASS} group-active:bg-[color:var(--cm-room-primary-soft)]`;

export const CommunityMessengerRoomPhase2Header = memo(function CommunityMessengerRoomPhase2Header() {
  const { t } = useI18n();
  const isMessengerSplit = useIsMessengerSplitViewport();
  const vm = useMessengerRoomPhase2HeaderView();
  const hydrationPass = useCmRoomPhase2HydrationPass();
  const ownerSlideHost = useOwnerOrderChatSlideHost();
  const buyerSlideHost = useBuyerOrderChatSlideHost();
  useLayoutEffect(() => {
    noteCmRoomPass1HeaderMs();
  }, [vm.snapshot.room.id]);
  const searchParams = useMessengerRoomUrlSearchParams();
  const requestAnimatedBack = useMessengerRoomAnimatedBack();
  const bindPresenceAndTyping = hydrationPass >= 2;

  const deliveryMeta = useMemo(() => {
    const room = vm.snapshot.room;
    const windowStoreOrder =
      roomShowsStoreOrderWindowHeader(room) ||
      messengerRoomShowsConfirmedDeliveryPresentation(room, vm.snapshot.viewerUserId);
    if (!windowStoreOrder) return null;
    return resolveCommunityMessengerDeliveryContextMeta(room);
  }, [vm.snapshot.room, vm.snapshot.viewerUserId]);
  const storeOrderId =
    typeof deliveryMeta?.storeOrderId === "string" ? deliveryMeta.storeOrderId.trim() : "";
  const storeId = typeof deliveryMeta?.storeId === "string" ? deliveryMeta.storeId.trim() : "";
  const isDeliveryRoom = Boolean(deliveryMeta) && storeOrderId.length > 0;
  const deliveryViewerRole = messengerDeliveryViewerRole(deliveryMeta, vm.snapshot.myRole);
  const isDeliveryBuyer = isDeliveryRoom && deliveryViewerRole === "buyer";
  const isTradeRoom = messengerRoomShowsConfirmedTradePresentation(
    vm.snapshot.room,
    vm.snapshot.viewerUserId
  );
  const tradeCallPolicy = useMemo(() => {
    if (!isTradeRoom) return "none";
    return normalizeTradeChatCallPolicy(vm.snapshot.tradeChatRoomDetail?.product?.tradeChatCallPolicy);
  }, [isTradeRoom, vm.snapshot.tradeChatRoomDetail?.product?.tradeChatCallPolicy]);
  const callMenuKind = resolveMessengerDotMenuCallKind(vm.snapshot.room, { isDeliveryRoom });
  const headerCallVisibility = useMemo(
    () =>
      resolveMessengerDotMenuCallVisibility({
        callKind: callMenuKind,
        tradeAllowCall: tradeChatCallPolicyAllowsVoice(tradeCallPolicy),
        tradeVideoCallEnabled: tradeChatCallPolicyAllowsVideo(tradeCallPolicy),
        deliveryAllowVoiceCall: deliveryMeta?.storeVoiceCallsEnabled,
        deliveryAllowVideoCall: deliveryMeta?.storeVideoCallsEnabled,
      }),
    [
      callMenuKind,
      deliveryMeta?.storeVideoCallsEnabled,
      deliveryMeta?.storeVoiceCallsEnabled,
      tradeCallPolicy,
    ]
  );
  const showHeaderVoiceCall =
    !vm.isGroupRoom &&
    !vm.isPrivateGroupRoom &&
    communityMessengerRoomIsGloballyUsable(vm.snapshot.room) &&
    headerCallVisibility.showVoice &&
    !isDeliveryBuyer;
  const headerVoiceDisabled = vm.roomUnavailable || vm.outgoingDialLocked;
  const roomId = vm.snapshot.room.id;
  const peerUserId = vm.snapshot.room.peerUserId ?? "";
  const canOpenPeerFriendProfile = vm.canOpenPeerFriendProfile;
  const [headerVoiceConfirmOpen, setHeaderVoiceConfirmOpen] = useState(false);

  /** 내 통화가 울리는 중/진행 중이면 확인 팝업을 다시 띄우지 않는다 — 기존 통화로 돌아가거나 「통화 중」 안내(1회 통화). */
  const ownLiveCall = useOwnLiveCall();
  const openHeaderVoiceConfirm = () => {
    if (ownLiveCall) {
      setHeaderVoiceConfirmOpen(false);
      void vm.startManagedDirectCall("voice");
      return;
    }
    logCallV3ButtonClick({
      location: "room_header",
      roomId,
      peerId: peerUserId,
      mediaType: "audio",
    });
    setHeaderVoiceConfirmOpen(true);
  };

  useEffect(() => {
    logCallV3ButtonRender({
      location: "room_header",
      roomId,
      peerId: peerUserId,
      visible: showHeaderVoiceCall,
      disabled: headerVoiceDisabled,
      reason: !showHeaderVoiceCall
        ? vm.isGroupRoom || vm.isPrivateGroupRoom
          ? "group_room"
          : !headerCallVisibility.showVoice
            ? "call_gate_hidden"
            : isDeliveryBuyer
              ? "delivery_buyer_has_dedicated_button"
              : "not_globally_usable"
        : headerVoiceDisabled
          ? vm.roomUnavailable
            ? "room_unavailable"
            : "outgoing_dial_locked"
          : null,
    });
  }, [
    headerCallVisibility.showVoice,
    headerVoiceDisabled,
    isDeliveryBuyer,
    peerUserId,
    roomId,
    showHeaderVoiceCall,
    vm.isGroupRoom,
    vm.isPrivateGroupRoom,
    vm.outgoingDialLocked,
    vm.roomUnavailable,
  ]);

  const deliveryHeaderModel = useStoreOrderDeliveryMessengerHeader({
    isDeliveryRoom,
    deliveryHeadline: deliveryMeta?.headline,
    contextStoreDisplayName: deliveryMeta?.storeDisplayName,
    storeOrderId,
    storeId,
    myRole: vm.snapshot.myRole,
    roomTitle: vm.snapshot.room.title,
    roomAvatarUrl: vm.snapshot.room.avatarUrl,
    peerUserId: vm.snapshot.room.peerUserId ?? "",
    viewerUserId: vm.snapshot.viewerUserId ?? "",
    members: vm.snapshot.members,
    thumbnailUrl: deliveryMeta?.thumbnailUrl ?? null,
  });

  const useDeliveryHeaderBlock =
    isDeliveryRoom && deliveryHeaderModel.mode !== "none" && deliveryHeaderModel.showAvatar;

  const peerPresence = useCommunityMessengerPeerPresence(
    bindPresenceAndTyping ? vm.snapshot.room.peerUserId ?? null : null,
    bindPresenceAndTyping ? (vm.snapshot.peerPresence ?? null) : null
  );

  const typingPeerCount = useMessengerTypingStore((state) => {
    if (!bindPresenceAndTyping) return 0;
    const roomId = vm.snapshot.room.id.trim().toLowerCase();
    const viewerId = vm.snapshot.viewerUserId ?? "";
    const now = Date.now();
    if (!roomId) return 0;
    if (vm.snapshot.room.roomType === "direct") {
      const peerUserId = vm.snapshot.room.peerUserId ?? "";
      if (!peerUserId) return 0;
      const entry = state.byRoomId[roomId]?.[peerUserId];
      return entry && entry.expiresAt > now ? 1 : 0;
    }
    const bucket = state.byRoomId[roomId] ?? {};
    let n = 0;
    for (const [uid, entry] of Object.entries(bucket)) {
      if (uid === viewerId) continue;
      if (entry.expiresAt > now) n += 1;
    }
    return n;
  });

  const statusLine = useMemo(() => {
    if (vm.snapshot.room.roomType !== "direct") {
      if (typingPeerCount >= 2) return t("cm_ui_typing_multiple", { count: typingPeerCount });
      if (typingPeerCount === 1) return t("chats_peer_typing");
      return vm.roomHeaderStatus;
    }
    if (typingPeerCount > 0) return t("chats_peer_typing");
    if (peerPresence) {
      return formatMessengerPeerPresenceLine(peerPresence);
    }
    return vm.roomHeaderStatus;
  }, [peerPresence, t, typingPeerCount, vm.roomHeaderStatus, vm.snapshot.room.roomType]);

  const peerTradeRoleLabel = useMemo(() => {
    const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
    if (ctx?.kind !== "trade") return null;
    const d = vm.snapshot.tradeChatRoomDetail;
    const v = (vm.snapshot.viewerUserId ?? "").trim();
    if (d && v) {
      const seller = (d.sellerId ?? "").trim();
      if (seller) return v === seller ? t("cm_ui_trade_role_buyer") : t("cm_ui_trade_role_seller");
    }
    const mine = ctx.roleLabel?.trim();
    if (!mine) return null;
    const sellerKo = translate("ko", "cm_ui_trade_role_seller");
    const buyerKo = translate("ko", "cm_ui_trade_role_buyer");
    if (mine === t("cm_ui_trade_role_seller") || mine === sellerKo) return t("cm_ui_trade_role_buyer");
    if (mine === t("cm_ui_trade_role_buyer") || mine === buyerKo) return t("cm_ui_trade_role_seller");
    return null;
  }, [t, vm.snapshot.room.contextMeta, vm.snapshot.tradeChatRoomDetail, vm.snapshot.viewerUserId]);

  const listingHeader = vm.tradeListingHeader;
  const tradePostDetailSlide = useTradePostDetailSlideHost();
  const listingSubtitle = useMemo(() => {
    if (!listingHeader) return statusLine;
    if (typingPeerCount > 0) return t("chats_peer_typing");
    if (vm.snapshot.room.roomType === "direct" && peerPresence) {
      return formatMessengerPeerPresenceLine(peerPresence);
    }
    return "";
  }, [listingHeader, peerPresence, statusLine, t, typingPeerCount, vm.snapshot.room.roomType]);

  const openListingDetailSlide = () => {
    const postId = listingHeader?.postId?.trim();
    if (!postId || !tradePostDetailSlide) return;
    tradePostDetailSlide.openPostDetail(postId);
  };

  const handleBack = () => {
    if (ownerSlideHost?.closeSlide) {
      ownerSlideHost.closeSlide();
      return;
    }
    if (buyerSlideHost?.closeSlide) {
      buyerSlideHost.closeSlide();
      return;
    }
    if (isMessengerSplit) {
      markCommunityMessengerHomeReturn({
        roomId: vm.snapshot.room.id,
        viewerUserId: vm.snapshot.viewerUserId,
      });
      if (vm.snapshot.room.roomType === "open_group") {
        vm.router.replace(SAMARKET_ROUTES.chat.messengerMeetingsHub, { scroll: false });
        return;
      }
      const plan = resolveMessengerRoomBackNavigation({
        roomId: vm.snapshot.room.id,
        searchParams,
      });
      /**
       * 분할에서도 모바일과 같은 계획 — history back(+폴백). 방 전환은 replace 라 기록 = [허브, 방] →
       * 헤더 ← 와 Android 시스템 뒤로 결과가 같다 (BK-06). 계획 자체의 forceDirect(override·배달)는 유지.
       */
      runMessengerRoomBackNavigation(vm.router, plan);
      return;
    }
    if (requestAnimatedBack) {
      requestAnimatedBack();
      return;
    }
    markCommunityMessengerHomeReturn({
      roomId: vm.snapshot.room.id,
      viewerUserId: vm.snapshot.viewerUserId,
    });
    if (vm.snapshot.room.roomType === "open_group") {
      vm.router.replace(SAMARKET_ROUTES.chat.messengerMeetingsHub, { scroll: false });
      return;
    }
    const plan = resolveMessengerRoomBackNavigation({
      roomId: vm.snapshot.room.id,
      searchParams,
    });
    runMessengerRoomBackNavigation(vm.router, plan);
  };

  const voiceConfirmPeerLabel = useMemo(() => {
    if (isDeliveryBuyer && deliveryHeaderModel.mode === "buyer_store") {
      const storeLabel = resolveStoreOrderBuyerVoicePeerLabel({
        headerMode: deliveryHeaderModel.mode,
        storeDisplayName: deliveryHeaderModel.title,
      });
      if (storeLabel) return storeLabel;
    }
    return vm.snapshot.room.title?.trim() || "";
  }, [deliveryHeaderModel.mode, deliveryHeaderModel.title, isDeliveryBuyer, vm.snapshot.room.title]);

  const showDeliveryPresence =
    useDeliveryHeaderBlock &&
    deliveryHeaderModel.showPresence &&
    bindPresenceAndTyping &&
    vm.snapshot.room.roomType === "direct" &&
    peerPresence;

  const deliveryHeaderSubtitle = useMemo(() => {
    if (!useDeliveryHeaderBlock) return statusLine;
    if (typingPeerCount > 0) return t("chats_peer_typing");
    if (deliveryHeaderModel.mode === "buyer_store") {
      const presenceLine =
        bindPresenceAndTyping && vm.snapshot.room.roomType === "direct"
          ? formatMessengerPeerPresenceLine(peerPresence)
          : null;
      return formatDeliveryMessengerPresenceIndustrySubtitle({
        presenceLine,
        industryPrimary: deliveryHeaderModel.industryPrimary,
        industrySecondary: deliveryHeaderModel.industrySecondary,
      });
    }
    if (bindPresenceAndTyping && vm.snapshot.room.roomType === "direct" && peerPresence) {
      return formatMessengerPeerPresenceLine(peerPresence);
    }
    return deliveryHeaderModel.subtitle?.trim() || null;
  }, [
    bindPresenceAndTyping,
    deliveryHeaderModel.industryPrimary,
    deliveryHeaderModel.industrySecondary,
    deliveryHeaderModel.mode,
    deliveryHeaderModel.subtitle,
    peerPresence,
    statusLine,
    t,
    typingPeerCount,
    useDeliveryHeaderBlock,
    vm.snapshot.room.roomType,
  ]);

  return (
    <>
    <MessengerHeader
      className={
        isMessengerSplit
          ? "min-w-0 overflow-hidden pt-[var(--safe-top)] pr-[max(12px,var(--safe-right))]"
          : undefined
      }
    >
        <button
          type="button"
          onClick={handleBack}
          className={`${CM_ROOM_HEADER_TOUCH_BTN_CLASS} self-center text-[color:var(--cm-room-text)]`}
          aria-label={buyerSlideHost ? vm.t("common_close") : vm.t("tier1_back")}
        >
          <span className={CM_ROOM_HEADER_TOUCH_FACE_CLASS}>
            {buyerSlideHost ?
              <X className="h-[18px] w-[18px]" aria-hidden />
            : <BackIcon />}
          </span>
        </button>

        {useDeliveryHeaderBlock ? (
          <StoreOrderDeliveryMessengerHeaderBlock
            model={deliveryHeaderModel}
            presenceState={showDeliveryPresence ? peerPresence.state : null}
            showPresence={Boolean(showDeliveryPresence)}
            subtitle={deliveryHeaderSubtitle}
          />
        ) : listingHeader ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (listingHeader.postId && tradePostDetailSlide) openListingDetailSlide();
              }}
              className={`flex min-w-0 flex-1 items-center gap-2 self-center text-left active:opacity-80${
                listingHeader.postId && tradePostDetailSlide ? "" : " cursor-default"
              }`}
              aria-label={listingHeader.headerTitle}
            >
              <div className="relative h-9 w-9 shrink-0 self-center">
                <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                  <SamarketThumbnail
                    src={listingHeader.imageUrl || ""}
                    fill
                    roundedClassName="rounded-full"
                    className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
                    fallbackSrc=""
                    fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                  />
                </div>
              </div>
              <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 leading-tight">
                <p className="-translate-y-[1pt] truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                  {listingHeader.headerTitle}
                </p>
                {listingSubtitle ? (
                  <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">
                    {listingSubtitle}
                  </p>
                ) : null}
              </div>
            </button>
          </>
        ) : vm.isGroupRoom ? (
          <button
            type="button"
            onClick={() => vm.setActiveSheet("menu")}
            className="flex min-w-0 flex-1 items-center gap-2 self-center text-left active:opacity-80"
            aria-label={vm.t("nav_messenger_open_group_settings")}
            data-group-header-identity="1"
          >
            <div className="relative h-9 w-9 shrink-0 self-center overflow-hidden rounded-full">
              <GroupDomainAvatar
                imageUrl={vm.snapshot.room.avatarUrl}
                size={36}
                fill
                className="h-full w-full"
              />
            </div>
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 leading-tight">
              <p className="-translate-y-[1pt] truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                {vm.snapshot.room.title}
              </p>
              <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
            </div>
          </button>
        ) : canOpenPeerFriendProfile ? (
          <button
            type="button"
            onClick={vm.openPeerFriendProfile}
            className="flex min-w-0 flex-1 items-center gap-2 self-center text-left active:opacity-80"
            aria-label={vm.snapshot.room.title}
          >
            <div className="relative h-9 w-9 shrink-0 self-center">
              <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                <SamarketThumbnail
                  src={resolveUserAvatarImageSrc(vm.snapshot.room.avatarUrl)}
                  fill
                  roundedClassName="rounded-full"
                  className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
                  fallbackSrc=""
                  fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                />
              </div>
              {bindPresenceAndTyping && vm.snapshot.room.roomType === "direct" && peerPresence ? (
                <CommunityMessengerPresenceDot state={peerPresence.state} />
              ) : null}
            </div>
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 leading-tight">
              <p className="-translate-y-[1pt] truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                {vm.snapshot.room.title}
              </p>
              <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
            </div>
          </button>
        ) : (
          <>
            <div className="relative h-9 w-9 shrink-0 self-center">
              <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                <SamarketThumbnail
                  src={resolveUserAvatarImageSrc(vm.snapshot.room.avatarUrl)}
                  fill
                  roundedClassName="rounded-full"
                  className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
                  fallbackSrc=""
                  fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                />
              </div>
              {bindPresenceAndTyping && vm.snapshot.room.roomType === "direct" && peerPresence ? (
                <CommunityMessengerPresenceDot state={peerPresence.state} />
              ) : null}
            </div>
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 leading-tight">
              {peerTradeRoleLabel ? (
                <p className="truncate sam-text-xxs text-[color:var(--cm-room-text-muted)]">
                  <span className="inline-block -translate-y-[1pt] font-semibold leading-snug text-[color:var(--cm-room-text)] sam-text-helper">
                    {vm.snapshot.room.title}
                  </span>
                  <span aria-hidden> | </span>
                  <span>{peerTradeRoleLabel}</span>
                </p>
              ) : (
                <p className="-translate-y-[1pt] truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                  {vm.snapshot.room.title}
                </p>
              )}
              <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
            </div>
          </>
        )}

        <div className="flex shrink-0 items-center gap-0 self-center">
          {vm.isGroupRoom ? (
            <button
              type="button"
              onClick={() => {
                vm.setRoomSearchQuery("");
                vm.setActiveSheet("search");
              }}
              className={`${CM_ROOM_HEADER_TOUCH_BTN_CLASS} text-[color:var(--cm-room-text-muted)]`}
              aria-label={vm.t("cm_ui_search_in_chat")}
            >
              <span className={CM_ROOM_HEADER_TOUCH_FACE_CLASS}>
                <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
            </button>
          ) : null}
          {vm.isGroupRoom ? (
            <button
              type="button"
              onClick={() => vm.setActiveSheet("menu")}
              className={`${CM_ROOM_HEADER_TOUCH_BTN_CLASS} text-[#006241]`}
              aria-label={vm.t("nav_messenger_open_group_settings")}
            >
              <span className={`${CM_ROOM_HEADER_TOUCH_FACE_BASE_CLASS} group-active:bg-[#EAF4EF]`}>
                <Settings className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
            </button>
          ) : null}
          {isDeliveryBuyer || showHeaderVoiceCall ? (
            <button
              type="button"
              onClick={openHeaderVoiceConfirm}
              disabled={headerVoiceDisabled}
              className={`${CM_ROOM_HEADER_TOUCH_BTN_CLASS} disabled:opacity-45 ${
                ownLiveCall ? "text-[color:var(--cm-room-primary,#006B43)]" : "text-[color:var(--cm-room-text-muted)]"
              }`}
              aria-label={ownLiveCall ? vm.t("cm_ui_call_in_progress_return") : vm.t("cm_ui_voice_call")}
              data-cm-own-call-live={ownLiveCall ? "1" : undefined}
            >
              <span className={`${CM_ROOM_HEADER_TOUCH_FACE_CLASS} relative`}>
                <Phone className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                {ownLiveCall ? (
                  <span
                    className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-[color:var(--cm-room-primary,#006B43)]"
                    aria-hidden
                  />
                ) : null}
              </span>
            </button>
          ) : null}
          {/*
           * 1:1·거래 방 ⋮ 메뉴(검색·미디어·알림끄기·보관·나가기·영상·연락처 추가)는 전화 버튼과 **함께** 표시.
           * 3f49bc530(통화 진입 수정)이 전화 분기를 ⋮ 앞 삼항으로 넣어 메뉴가 사라지던 회귀 복원 (T-03).
           * 배달 구매자 방(f019baa63)·그룹 방(⚙ = 메뉴)은 기존 계약 유지.
           */}
          {isDeliveryBuyer || vm.isPrivateGroupRoom || vm.isGroupRoom ? null : (
            <button
              type="button"
              onClick={() => vm.setActiveSheet("menu")}
              className={`${CM_ROOM_HEADER_TOUCH_BTN_CLASS} text-[color:var(--cm-room-text-muted)]`}
              aria-label={vm.t("nav_messenger_room_menu")}
            >
              <span className={CM_ROOM_HEADER_TOUCH_FACE_CLASS}>
                <MoreIcon className="h-[18px] w-[18px]" />
              </span>
            </button>
          )}
        </div>
    </MessengerHeader>
    {headerVoiceConfirmOpen && !ownLiveCall ? (
      <MessengerOutgoingCallConfirmDialog
        open
        peerLabel={voiceConfirmPeerLabel}
        kind="voice"
        busy={vm.outgoingDialLocked}
        onCancel={() => setHeaderVoiceConfirmOpen(false)}
        onConfirm={() => {
          setHeaderVoiceConfirmOpen(false);
          void vm.startManagedDirectCall("voice");
        }}
      />
    ) : null}
    </>
  );
});
