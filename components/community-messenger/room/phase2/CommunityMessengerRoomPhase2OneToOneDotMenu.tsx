"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import type { ChatRoom } from "@/lib/types/chat";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import {
  normalizeTradeChatCallPolicy,
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
} from "@/lib/trade/trade-chat-call-policy";
import {
  resolveMessengerPeerSocialCta,
  type MessengerPeerSocialCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { resolveDirectCallDenyUserMessage } from "@/lib/community-messenger/direct-call-permission-messages";
import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";
import { logCallPermission } from "@/lib/community-messenger/direct-call-permission";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  ChatRoomMoreMenu,
  type ChatRoomMenuProfileOverride,
  type DeliveryStoreMenuSummary,
  type OtherUserProfile,
  type Product,
  type Relation,
  type RoomType,
  type TradeRoomContext,
} from "@/components/community-messenger/room/phase2/ChatRoomMoreMenu";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";
import { useStoreOrderDeliveryRoomOptional } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import {
  communityMessengerRoomIsConfirmedTrade,
  resolveMessengerDotMenuCallKind,
  resolveMessengerDotMenuCallVisibility,
} from "@/lib/community-messenger/messenger-room-domain";

function mapSellerListingToProductStatus(
  raw: unknown,
  postStatus: string | null | undefined
): Product["status"] {
  const ls = normalizeSellerListingState(raw, postStatus ?? undefined);
  if (ls === "negotiating") return "inquiring";
  if (ls === "reserved") return "reserved";
  if (ls === "completed") return "sold";
  return "selling";
}

function mapRelationFromSnapshot(
  peerFriendshipState: CommunityMessengerRoomSnapshot["peerFriendshipState"],
  cta: MessengerPeerSocialCta
): Relation {
  if (peerFriendshipState === "pending") return "requested";
  if (peerFriendshipState === "accepted" || cta.kind === "friend") return "accepted";
  return "none";
}

function buildTradeContextFromDetail(
  detail: ChatRoom,
  viewerUserId: string
): TradeRoomContext | null {
  const p = detail.product;
  if (!p?.id) return null;
  const policy = normalizeTradeChatCallPolicy(p.tradeChatCallPolicy);
  const product: Product = {
    id: p.id,
    title: (p.title ?? "").trim() || translateCmUi("cm_ui_product_label_fallback"),
    price: typeof p.price === "number" && Number.isFinite(p.price) ? p.price : 0,
    thumbnailUrl: p.thumbnail?.trim() ? p.thumbnail.trim() : null,
    status: mapSellerListingToProductStatus(p.sellerListingState, p.status),
    allow_call: tradeChatCallPolicyAllowsVoice(policy),
  };
  const vid = viewerUserId.trim();
  const sellerId = (detail.sellerId ?? "").trim();
  const buyerId = (detail.buyerId ?? "").trim();
  const viewerRole: "seller" | "buyer" = vid && vid === sellerId ? "seller" : "buyer";
  return { product, sellerId, buyerId, viewerRole };
}

function buildTradeContextFromMeta(
  meta: CommunityMessengerRoomContextMetaV1,
  viewerUserId: string
): TradeRoomContext {
  const pid = (meta.productChatId ?? "").trim() || "trade";
  const headline = (meta.headline ?? "").trim() || translateCmUi("cm_ui_trade_headline_fallback");
  const priceMatch = (meta.priceLabel ?? "").replace(/[^\d.]/g, "");
  const priceNum = priceMatch ? Number(priceMatch) : 0;
  const product: Product = {
    id: pid,
    title: headline,
    price: Number.isFinite(priceNum) ? priceNum : 0,
    thumbnailUrl: meta.thumbnailUrl ?? null,
    status: "selling",
    allow_call: false,
  };
  return {
    product,
    sellerId: "",
    buyerId: "",
    viewerRole: viewerUserId ? "buyer" : "buyer",
  };
}

export function CommunityMessengerRoomPhase2OneToOneDotMenu({ vm }: { vm: MessengerRoomPhase2ViewModel }) {
  const { t } = useI18n();

  const peerUserId = (vm.snapshot.room.peerUserId ?? "").trim();
  const peerProfile = useMemo(
    () => vm.snapshot.members.find((m) => m.id.trim() === peerUserId) ?? null,
    [vm.snapshot.members, peerUserId]
  );

  const deliveryMeta = useMemo(
    () => resolveCommunityMessengerDeliveryContextMeta(vm.snapshot.room),
    [vm.snapshot.room.contextMeta, vm.snapshot.room.messengerDirectKey, vm.snapshot.room.summary]
  );
  const storeOrderId =
    typeof deliveryMeta?.storeOrderId === "string" ? deliveryMeta.storeOrderId.trim() : "";
  const isDeliveryRoom = deliveryMeta != null && storeOrderId.length > 0;

  const deliveryRoomSnap = useStoreOrderDeliveryRoomOptional();
  const deliveryHeaderModel = useStoreOrderDeliveryMessengerHeader({
    isDeliveryRoom,
    deliveryHeadline: deliveryMeta?.headline,
    storeOrderId,
    storeId: vm.storeIdForDock,
    myRole: vm.snapshot.myRole,
    roomTitle: vm.snapshot.room.title,
    roomAvatarUrl: vm.snapshot.room.avatarUrl,
    peerUserId: vm.snapshot.room.peerUserId ?? "",
    viewerUserId: vm.snapshot.viewerUserId ?? "",
    members: vm.snapshot.members,
    thumbnailUrl: deliveryMeta?.thumbnailUrl ?? null,
  });

  const isTradeRoom = communityMessengerRoomIsConfirmedTrade(vm.snapshot.room);
  const callMenuKind = resolveMessengerDotMenuCallKind(vm.snapshot.room, { isDeliveryRoom });
  const roomType: RoomType = isTradeRoom ? "trade" : "direct";

  const friendAddCta = useMemo((): MessengerPeerSocialCta => {
    if (!peerUserId) return { kind: "add_friend" };
    const peerIsFriend =
      vm.snapshot.peerFriendshipState === "accepted" || Boolean(peerProfile?.isFriend);
    const peerPick = peerProfile ?? { id: peerUserId, isFriend: peerIsFriend, blocked: false };
    return resolveMessengerPeerSocialCta({
      ...peerPick,
      isFriend: peerIsFriend,
    });
  }, [peerProfile, peerUserId, vm.snapshot.peerFriendshipState]);

  const relation: Relation = useMemo(
    () => mapRelationFromSnapshot(vm.snapshot.peerFriendshipState, friendAddCta),
    [friendAddCta, vm.snapshot.peerFriendshipState]
  );

  const assertGeneralDirectCallAllowed = useCallback(
    (kind: "voice" | "video"): boolean => {
      if (callMenuKind !== "general") return true;
      const gate = vm.snapshot.directCallGate;
      if (!gate) return true;
      const allowed = kind === "video" ? gate.canStartVideo : gate.canStartVoice;
      if (allowed) return true;
      const code: DirectCallDenyCode = gate.denyCode ?? "deny_blocked";
      logCallPermission("ui_gate_start", {
        callerUserId: vm.snapshot.viewerUserId,
        calleeUserId: peerUserId || undefined,
        roomId: vm.snapshot.room.id,
        code,
        callKind: kind,
      });
      showMessengerSnackbar(resolveDirectCallDenyUserMessage(code), { variant: "error" });
      return false;
    },
    [callMenuKind, peerUserId, vm.snapshot.directCallGate, vm.snapshot.room.id, vm.snapshot.viewerUserId]
  );

  const livePeerPresence = useCommunityMessengerPeerPresence(peerUserId || null, vm.snapshot.peerPresence ?? null);

  const mannerScore = useMemo(() => {
    const d = vm.snapshot.tradeChatRoomDetail;
    const n = d?.partnerTrustScore;
    if (typeof n === "number" && Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    return 50;
  }, [vm.snapshot.tradeChatRoomDetail]);

  const otherUser: OtherUserProfile = useMemo(
    () => ({
      id: peerUserId || "peer",
      nickname: peerProfile?.label?.trim() || vm.snapshot.room.title?.trim() || t("cm_ui_peer_fallback"),
      avatarUrl: peerProfile?.avatarUrl?.trim() || vm.snapshot.room.avatarUrl,
      peerPresence: livePeerPresence,
      mannerScore,
    }),
    [
      livePeerPresence,
      mannerScore,
      peerProfile?.avatarUrl,
      peerProfile?.label,
      peerUserId,
      t,
      vm.snapshot.room.avatarUrl,
      vm.snapshot.room.title,
    ]
  );

  const tradeContext: TradeRoomContext | undefined = useMemo(() => {
    if (!isTradeRoom) return undefined;
    const detail = vm.snapshot.tradeChatRoomDetail;
    if (detail) {
      const built = buildTradeContextFromDetail(detail, vm.snapshot.viewerUserId);
      return built ?? undefined;
    }
    const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
    if (ctx?.kind === "trade") return buildTradeContextFromMeta(ctx, vm.snapshot.viewerUserId);
    return undefined;
  }, [isTradeRoom, vm.snapshot.room.contextMeta, vm.snapshot.tradeChatRoomDetail, vm.snapshot.viewerUserId]);

  const tradeVideoCallEnabled = useMemo(() => {
    if (!isTradeRoom) return false;
    const detail = vm.snapshot.tradeChatRoomDetail;
    if (!detail?.product) return false;
    const policy = normalizeTradeChatCallPolicy(detail.product.tradeChatCallPolicy);
    return tradeChatCallPolicyAllowsVideo(policy);
  }, [isTradeRoom, vm.snapshot.tradeChatRoomDetail]);

  const dotMenuCallVisibility = useMemo(
    () =>
      resolveMessengerDotMenuCallVisibility({
        callKind: callMenuKind,
        tradeAllowCall: tradeContext?.product.allow_call,
        tradeVideoCallEnabled,
        deliveryAllowVoiceCall: deliveryMeta?.storeVoiceCallsEnabled,
        deliveryAllowVideoCall: deliveryMeta?.storeVideoCallsEnabled,
      }),
    [
      callMenuKind,
      deliveryMeta?.storeVideoCallsEnabled,
      deliveryMeta?.storeVoiceCallsEnabled,
      tradeContext?.product.allow_call,
      tradeVideoCallEnabled,
    ]
  );

  const deliveryMenuProfile = useMemo((): ChatRoomMenuProfileOverride | undefined => {
    if (!isDeliveryRoom || deliveryHeaderModel.mode === "none" || deliveryHeaderModel.mode === "generic_delivery") {
      return undefined;
    }
    return {
      nickname: deliveryHeaderModel.title,
      avatarUrl: deliveryHeaderModel.avatarUrl,
      avatarShape: deliveryHeaderModel.avatarRounded === "store_rect" ? "store_rect" : "circle",
      hideMannerBattery: deliveryHeaderModel.mode === "buyer_store",
      mannerScore,
      buyerTrustPercent: deliveryHeaderModel.buyerTrustPercent,
    };
  }, [deliveryHeaderModel, isDeliveryRoom, mannerScore]);

  const deliveryStoreSummary = useMemo((): DeliveryStoreMenuSummary | undefined => {
    if (!isDeliveryRoom || deliveryHeaderModel.mode !== "buyer_store") return undefined;
    const snap = deliveryRoomSnap?.snapshot;
    const addressLine =
      snap?.orderCard?.addressLines?.[0] ??
      formatStoreOrderDeliveryAddressPlain({
        summary: snap?.buyerOrder?.delivery_address_summary,
        detail: snap?.buyerOrder?.delivery_address_detail,
      }) ??
      null;
    return {
      storeName: deliveryHeaderModel.title,
      statusLabel:
        snap?.orderCard?.statusLabel ??
        deliveryMeta?.stepLabel ??
        snap?.buyerOrder?.order_status ??
        null,
      addressLine,
    };
  }, [
    deliveryHeaderModel.mode,
    deliveryHeaderModel.title,
    deliveryMeta?.stepLabel,
    deliveryRoomSnap?.snapshot,
    isDeliveryRoom,
  ]);

  const onFriendRequest = useCallback(async () => {
    if (!peerUserId) return;
    if (peerProfile?.blocked) {
      showMessengerSnackbar(t("cm_social_cannot_start_chat"), { variant: "error" });
      return;
    }
    const res = await fetch("/api/community-messenger/relations/friend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: peerUserId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      showMessengerSnackbar(t("cm_ui_friend_request_send_failed"), { variant: "error" });
      return;
    }
    showMessengerSnackbar(t("cm_ui_sent_friend_request"), { variant: "success" });
    void vm.refresh(true);
  }, [peerProfile?.blocked, peerUserId, t, vm]);

  return (
    <ChatRoomMoreMenu
      roomType={roomType}
      relation={relation}
      otherUser={otherUser}
      menuProfile={deliveryMenuProfile}
      deliveryStoreSummary={deliveryStoreSummary}
      showVoiceCall={dotMenuCallVisibility.showVoice}
      showVideoCall={dotMenuCallVisibility.showVideo}
      isMuted={Boolean(vm.snapshot.room.isMuted)}
      isArchived={Boolean(vm.snapshot.room.isArchivedByViewer)}
      tradeContext={tradeContext}
      disableVoiceCall={vm.roomUnavailable || vm.outgoingDialLocked}
      disableVideoCall={vm.roomUnavailable || vm.outgoingDialLocked}
      disableMuteToggle={vm.busy === "room-mute"}
      disableArchiveToggle={
        vm.busy === "room-archive" || !communityMessengerRoomIsGloballyUsable(vm.snapshot.room)
      }
      disableLeaveRoom={vm.busy === "leave-room"}
      disableFriendRequest={Boolean(peerProfile?.blocked) || friendAddCta.kind === "blocked"}
      onSearch={() => {
        vm.setRoomSearchQuery("");
        vm.setActiveSheet("search");
      }}
      onOpenMediaFiles={() => {
        vm.setActiveSheet("media");
      }}
      onFriendRequest={() => {
        void onFriendRequest();
      }}
      onVoiceCall={() => {
        if (!assertGeneralDirectCallAllowed("voice")) return;
        vm.dismissRoomSheet();
        void vm.startManagedDirectCall("voice");
      }}
      onVideoCall={() => {
        if (!assertGeneralDirectCallAllowed("video")) return;
        vm.dismissRoomSheet();
        void vm.startManagedDirectCall("video");
      }}
      onToggleMute={() => void vm.toggleRoomMute()}
      onToggleArchive={() => void vm.toggleRoomArchive()}
      onLeaveRoom={() => void vm.requestLeaveRoom()}
    />
  );
}
