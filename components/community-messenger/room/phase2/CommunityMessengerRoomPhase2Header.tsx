"use client";

import { memo, useLayoutEffect, useMemo } from "react";
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
import { Search } from "lucide-react";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { useMessengerRoomAnimatedBack } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { noteCmRoomPass1HeaderMs } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { useCmRoomPhase2HydrationPass } from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { translate } from "@/lib/i18n/messages";
import { useOwnerOrderChatSlideHost } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";
import { StoreOrderDeliveryMessengerHeaderBlock } from "@/components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock";

export const CommunityMessengerRoomPhase2Header = memo(function CommunityMessengerRoomPhase2Header() {
  const { t } = useI18n();
  const vm = useMessengerRoomPhase2HeaderView();
  const hydrationPass = useCmRoomPhase2HydrationPass();
  const ownerSlideHost = useOwnerOrderChatSlideHost();
  useLayoutEffect(() => {
    noteCmRoomPass1HeaderMs();
  }, [vm.snapshot.room.id]);
  const searchParams = useMessengerRoomUrlSearchParams();
  const requestAnimatedBack = useMessengerRoomAnimatedBack();
  const bindPresenceAndTyping = hydrationPass >= 2;

  const deliveryMeta = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
  const storeOrderId =
    deliveryMeta?.kind === "delivery" && typeof deliveryMeta.storeOrderId === "string"
      ? deliveryMeta.storeOrderId.trim()
      : "";
  const storeId =
    deliveryMeta?.kind === "delivery" && typeof deliveryMeta.storeId === "string"
      ? deliveryMeta.storeId.trim()
      : "";
  const isDeliveryRoom = deliveryMeta?.kind === "delivery" && storeOrderId.length > 0;

  const deliveryHeaderModel = useStoreOrderDeliveryMessengerHeader({
    isDeliveryRoom,
    deliveryHeadline: deliveryMeta?.kind === "delivery" ? deliveryMeta.headline : undefined,
    storeOrderId,
    storeId,
    myRole: vm.snapshot.myRole,
    roomTitle: vm.snapshot.room.title,
    roomAvatarUrl: vm.snapshot.room.avatarUrl,
    peerUserId: vm.snapshot.room.peerUserId ?? "",
    viewerUserId: vm.snapshot.viewerUserId ?? "",
    members: vm.snapshot.members,
    thumbnailUrl:
      deliveryMeta?.kind === "delivery" ? (deliveryMeta.thumbnailUrl ?? null) : null,
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

  const handleBack = () => {
    if (ownerSlideHost?.closeSlide) {
      ownerSlideHost.closeSlide();
      return;
    }
    if (requestAnimatedBack) {
      requestAnimatedBack();
      return;
    }
    markCommunityMessengerHomeReturn();
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

  const showDeliveryPresence =
    useDeliveryHeaderBlock &&
    deliveryHeaderModel.showPresence &&
    bindPresenceAndTyping &&
    vm.snapshot.room.roomType === "direct" &&
    peerPresence;

  return (
    <MessengerHeader>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-[color:var(--cm-room-text)] transition active:bg-[color:var(--cm-room-primary-soft)]"
          aria-label={vm.t("tier1_back")}
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </button>

        {useDeliveryHeaderBlock ? (
          <StoreOrderDeliveryMessengerHeaderBlock
            model={deliveryHeaderModel}
            presenceState={showDeliveryPresence ? peerPresence.state : null}
            showPresence={Boolean(showDeliveryPresence)}
            subtitle={statusLine}
          />
        ) : (
          <>
            <div className="relative h-9 w-9 shrink-0 self-center">
              <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                <SamarketUserAvatarThumb
                  avatarUrl={vm.snapshot.room.avatarUrl}
                  fill
                  roundedClassName="rounded-full"
                  className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
              aria-label={vm.t("cm_ui_search_in_chat")}
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => vm.setActiveSheet("menu")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
            aria-label={vm.t("nav_messenger_room_menu")}
          >
            <MoreIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </MessengerHeader>
  );
});
