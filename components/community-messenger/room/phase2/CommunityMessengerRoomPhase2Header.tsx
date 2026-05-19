"use client";

import { memo, useLayoutEffect, useMemo } from "react";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { BackIcon, MoreIcon } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { useMessengerRoomPhase2HeaderView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-header-context";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { MessengerHeader } from "@/components/community-messenger/line-ui";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { Menu, Search } from "lucide-react";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { useMessengerRoomAnimatedBack } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { noteCmRoomPass1HeaderMs } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { useCmRoomPhase2HydrationPass } from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";
import { StoreOrderDeliveryMessengerHeaderBlock } from "@/components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock";
import { useStoreOrderDeliveryDetailDrawerOptional } from "@/components/community-messenger/room/phase2/store-order-delivery-detail-drawer-context";

export const CommunityMessengerRoomPhase2Header = memo(function CommunityMessengerRoomPhase2Header() {
  const vm = useMessengerRoomPhase2HeaderView();
  const hydrationPass = useCmRoomPhase2HydrationPass();
  useLayoutEffect(() => {
    noteCmRoomPass1HeaderMs();
  }, [vm.snapshot.room.id]);
  const searchParams = useMessengerRoomUrlSearchParams();
  const requestAnimatedBack = useMessengerRoomAnimatedBack();
  const bindPresenceAndTyping = hydrationPass >= 2;
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
      if (typingPeerCount >= 2) return `${typingPeerCount}명이 입력 중...`;
      if (typingPeerCount === 1) return "입력 중...";
      return vm.roomHeaderStatus;
    }
    if (typingPeerCount > 0) return "입력 중...";
    if (peerPresence) {
      return formatMessengerPeerPresenceLine(peerPresence);
    }
    return vm.roomHeaderStatus;
  }, [peerPresence, typingPeerCount, vm.roomHeaderStatus, vm.snapshot.room.roomType]);

  const deliveryCtx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
  const isDeliveryRoom = deliveryCtx?.kind === "delivery";
  const storeOrderIdForHeader =
    isDeliveryRoom && typeof deliveryCtx.storeOrderId === "string" ? deliveryCtx.storeOrderId.trim() : "";
  const storeIdForHeader =
    isDeliveryRoom && typeof deliveryCtx.storeId === "string" ? deliveryCtx.storeId.trim() : "";

  const deliveryHeader = useStoreOrderDeliveryMessengerHeader({
    isDeliveryRoom,
    deliveryHeadline: deliveryCtx?.headline,
    storeOrderId: storeOrderIdForHeader,
    storeId: storeIdForHeader,
    myRole: vm.snapshot.myRole,
    roomTitle: vm.snapshot.room.title,
    roomAvatarUrl: vm.snapshot.room.avatarUrl,
    peerUserId: vm.snapshot.room.peerUserId ?? "",
    viewerUserId: vm.snapshot.viewerUserId ?? "",
    members: vm.snapshot.members,
    thumbnailUrl: deliveryCtx?.thumbnailUrl ?? null,
  });

  const useDeliveryHeaderBlock =
    isDeliveryRoom && deliveryHeader.mode !== "none" && deliveryHeader.mode !== "generic_delivery";
  const orderDetailDrawer = useStoreOrderDeliveryDetailDrawerOptional();
  const deliveryOrderDetailMenu = Boolean(isDeliveryRoom && storeOrderIdForHeader && orderDetailDrawer);

  const peerTradeRoleLabel = useMemo(() => {
    const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
    if (ctx?.kind !== "trade") return null;
    const d = vm.snapshot.tradeChatRoomDetail;
    const v = (vm.snapshot.viewerUserId ?? "").trim();
    if (d && v) {
      const seller = (d.sellerId ?? "").trim();
      if (seller) return v === seller ? "구매자" : "판매자";
    }
    const mine = ctx.roleLabel?.trim();
    if (mine === "판매자") return "구매자";
    if (mine === "구매자") return "판매자";
    return null;
  }, [vm.snapshot.room.contextMeta, vm.snapshot.tradeChatRoomDetail, vm.snapshot.viewerUserId]);

  return (
    <>
      <MessengerHeader className="min-h-[52px] bg-white py-1">
        <div className="flex min-w-0 items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (requestAnimatedBack) {
                requestAnimatedBack();
                return;
              }
              markCommunityMessengerHomeReturn();
              if (vm.snapshot.room.roomType === "open_group") {
                vm.router.replace(SAMARKET_ROUTES.chat.messengerMeetingsHub, { scroll: false });
                return;
              }
              const fallback = buildMessengerRoomListBackHref(searchParams);
              runHistoryBackWithFallback(vm.router, fallback);
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-[color:var(--cm-room-text)] transition active:bg-[color:var(--cm-room-primary-soft)]"
            aria-label={vm.t("tier1_back")}
          >
            <BackIcon className="h-[18px] w-[18px]" />
          </button>

          {useDeliveryHeaderBlock ? (
            <StoreOrderDeliveryMessengerHeaderBlock
              model={deliveryHeader}
              presenceState={peerPresence?.state ?? null}
              showPresence={bindPresenceAndTyping && vm.snapshot.room.roomType === "direct"}
            />
          ) : !isDeliveryRoom ? (
            <div className="relative shrink-0 self-center">
              <SamarketThumbnail
                src={vm.snapshot.room.avatarUrl}
                size={36}
                roundedClassName="rounded-full"
                className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
                fallbackSrc=""
                fallbackNode={
                  <div className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-primary)]">
                    {vm.snapshot.room.title.trim().slice(0, 1).toUpperCase() || "?"}
                  </div>
                }
              />
            </div>
          ) : null}

          {!useDeliveryHeaderBlock ? (
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 overflow-hidden leading-tight">
              {peerTradeRoleLabel ? (
                <p className="truncate sam-text-xxs text-[color:var(--cm-room-text-muted)]">
                  <span className="inline-block -translate-y-[1pt] font-semibold leading-snug text-[color:var(--cm-room-text)] sam-text-helper">
                    {vm.snapshot.room.title}
                  </span>
                  <span aria-hidden> | </span>
                  <span>{peerTradeRoleLabel}</span>
                </p>
              ) : isDeliveryRoom && deliveryHeader.mode === "generic_delivery" ? (
                <p className="truncate text-[15px] font-semibold leading-tight text-[#111827]">
                  {deliveryHeader.title}
                </p>
              ) : (
                <p className="-translate-y-[1pt] truncate sam-text-body font-semibold leading-tight text-[color:var(--cm-room-text)]">
                  {vm.snapshot.room.title}
                </p>
              )}
              {!isDeliveryRoom ? (
                <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-0 self-center">
            {vm.isGroupRoom ? (
              <button
                type="button"
                onClick={() => {
                  vm.setRoomSearchQuery("");
                  vm.setActiveSheet("search");
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
                aria-label="대화 내 검색"
              >
                <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (deliveryOrderDetailMenu) {
                  orderDetailDrawer!.toggle();
                  return;
                }
                vm.setActiveSheet("menu");
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
              aria-label={deliveryOrderDetailMenu ? "주문 상세" : vm.t("nav_messenger_room_menu")}
            >
              {deliveryOrderDetailMenu ? (
                <Menu className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              ) : (
                <MoreIcon className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>
      </MessengerHeader>
    </>
  );
});
