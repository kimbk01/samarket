"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatRoom } from "@/lib/types/chat";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import {
  normalizeTradeChatCallPolicy,
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
} from "@/lib/trade/trade-chat-call-policy";
import {
  resolveMessengerFriendAddCta,
  type MessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import type {
  CommunityMessengerFriendRequest,
  CommunityMessengerRoomContextMetaV1,
} from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  ChatRoomMoreMenu,
  type OtherUserProfile,
  type Product,
  type Relation,
  type RoomType,
  type TradeRoomContext,
} from "@/components/community-messenger/room/phase2/ChatRoomMoreMenu";

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

function mapRelationFromCta(cta: ReturnType<typeof resolveMessengerFriendAddCta>): Relation {
  if (cta.kind === "friend") return "accepted";
  if (cta.kind === "pending_outgoing" || cta.kind === "pending_incoming") return "requested";
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
    title: (p.title ?? "").trim() || "상품",
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
  const headline = (meta.headline ?? "").trim() || "거래";
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
  const [friendRequests, setFriendRequests] = useState<CommunityMessengerFriendRequest[]>([]);

  const loadFriendRequests = useCallback(async () => {
    const res = await fetch("/api/community-messenger/friend-requests", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; requests?: CommunityMessengerFriendRequest[] };
    if (res.ok && json.ok && Array.isArray(json.requests)) setFriendRequests(json.requests);
    else setFriendRequests([]);
  }, []);

  useEffect(() => {
    void loadFriendRequests();
  }, [loadFriendRequests, vm.snapshot.room.id]);

  const peerUserId = (vm.snapshot.room.peerUserId ?? "").trim();
  const peerProfile = useMemo(
    () => vm.snapshot.members.find((m) => m.id.trim() === peerUserId) ?? null,
    [vm.snapshot.members, peerUserId]
  );

  const roomType: RoomType = useMemo(() => {
    const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
    if (ctx?.kind === "trade" && typeof ctx.productChatId === "string" && ctx.productChatId.trim()) return "trade";
    return "direct";
  }, [vm.snapshot.room.contextMeta]);

  const friendAddCta = useMemo((): MessengerFriendAddCta => {
    if (!peerUserId) return { kind: "add" };
    const peerPick = peerProfile ?? { id: peerUserId, isFriend: false, blocked: false };
    return resolveMessengerFriendAddCta(peerPick, vm.snapshot.viewerUserId, friendRequests);
  }, [friendRequests, peerProfile, peerUserId, vm.snapshot.viewerUserId]);

  const relation: Relation = useMemo(() => mapRelationFromCta(friendAddCta), [friendAddCta]);

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
      nickname: peerProfile?.label?.trim() || vm.snapshot.room.title?.trim() || "상대",
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
      vm.snapshot.room.avatarUrl,
      vm.snapshot.room.title,
    ]
  );

  const tradeContext: TradeRoomContext | undefined = useMemo(() => {
    if (roomType !== "trade") return undefined;
    const detail = vm.snapshot.tradeChatRoomDetail;
    if (detail) {
      const built = buildTradeContextFromDetail(detail, vm.snapshot.viewerUserId);
      return built ?? undefined;
    }
    const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
    if (ctx?.kind === "trade") return buildTradeContextFromMeta(ctx, vm.snapshot.viewerUserId);
    return undefined;
  }, [roomType, vm.snapshot.room.contextMeta, vm.snapshot.tradeChatRoomDetail, vm.snapshot.viewerUserId]);

  const tradeVideoCallEnabled = useMemo(() => {
    if (roomType !== "trade") return false;
    const detail = vm.snapshot.tradeChatRoomDetail;
    if (!detail?.product) return false;
    const policy = normalizeTradeChatCallPolicy(detail.product.tradeChatCallPolicy);
    return tradeChatCallPolicyAllowsVideo(policy);
  }, [roomType, vm.snapshot.tradeChatRoomDetail]);

  const onFriendRequest = useCallback(async () => {
    if (!peerUserId) return;
    if (peerProfile?.blocked) {
      showMessengerSnackbar("차단된 사용자에게는 친구 요청을 보낼 수 없습니다.", { variant: "error" });
      return;
    }
    const res = await fetch("/api/community-messenger/friend-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: peerUserId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      showMessengerSnackbar(json.error === "already_friend" ? "이미 친구입니다." : "친구 요청을 보내지 못했습니다.", {
        variant: "error",
      });
      return;
    }
    showMessengerSnackbar("친구 요청을 보냈습니다.");
    await loadFriendRequests();
    void vm.refresh(true);
  }, [loadFriendRequests, peerProfile?.blocked, peerUserId, vm]);

  return (
    <ChatRoomMoreMenu
      roomType={roomType}
      relation={relation}
      otherUser={otherUser}
      isMuted={Boolean(vm.snapshot.room.isMuted)}
      isArchived={Boolean(vm.snapshot.room.isArchivedByViewer)}
      tradeContext={tradeContext}
      tradeVideoCallEnabled={tradeVideoCallEnabled}
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
        vm.dismissRoomSheet();
        void vm.startManagedDirectCall("voice");
      }}
      onVideoCall={() => {
        vm.dismissRoomSheet();
        void vm.startManagedDirectCall("video");
      }}
      onToggleMute={() => void vm.toggleRoomMute()}
      onToggleArchive={() => void vm.toggleRoomArchive()}
      onLeaveRoom={() => void vm.leaveRoom()}
    />
  );
}
