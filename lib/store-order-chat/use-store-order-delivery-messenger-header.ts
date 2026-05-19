"use client";

import { useEffect, useMemo, useState } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import {
  buyerNicknameForOwnerHeader,
  resolveDeliveryPeerUserId,
  resolveStoreOrderDeliveryHeaderMode,
  type StoreOrderDeliveryHeaderMode,
} from "@/lib/store-order-chat/messenger-delivery-room-header";
import { useStoreOrderDeliveryRoomOptional } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import { useStoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";
import {
  mannerBatteryTier,
  mannerRawToPercent,
} from "@/lib/trust/manner-battery";
import { clampTrustScore } from "@/lib/trust/trust-score-core";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";

function storeNameFromDeliveryHeadline(headline: string | undefined): string | null {
  const h = headline?.trim();
  if (!h) return null;
  const sep = h.indexOf(" · ");
  return sep > 0 ? h.slice(0, sep).trim() || null : h;
}

export type StoreOrderDeliveryMessengerHeaderModel = {
  mode: StoreOrderDeliveryHeaderMode;
  showAvatar: boolean;
  avatarUrl: string | null;
  avatarRounded: "circle" | "store_rect";
  title: string;
  subtitle: string | null;
  showPresence: boolean;
  buyerTrustPercent: number | null;
  buyerTrustTier: ReturnType<typeof mannerBatteryTier> | null;
};

type Input = {
  isDeliveryRoom: boolean;
  deliveryHeadline: string | undefined;
  storeOrderId: string;
  storeId: string;
  myRole: "owner" | "admin" | "member";
  roomTitle: string;
  roomAvatarUrl: string | null;
  peerUserId: string;
  viewerUserId: string;
  members: CommunityMessengerProfileLite[];
  thumbnailUrl: string | null;
};

export function useStoreOrderDeliveryMessengerHeader(
  input: Input
): StoreOrderDeliveryMessengerHeaderModel {
  const deliveryRoom = useStoreOrderDeliveryRoomOptional();
  const fallbackSnapshot = useStoreOrderRoomSnapshot({
    storeOrderId: input.storeOrderId,
    storeId: input.storeId,
    isOwner: input.isDeliveryRoom && input.myRole === "owner" && Boolean(input.storeId),
    enabled:
      !deliveryRoom &&
      input.isDeliveryRoom &&
      Boolean(input.storeOrderId),
  });
  const storeOrderSnap = deliveryRoom?.snapshot ?? fallbackSnapshot.snapshot;

  const mode = useMemo(
    () =>
      resolveStoreOrderDeliveryHeaderMode({
        isDeliveryRoom: input.isDeliveryRoom,
        myRole: input.myRole,
        storeOrderSnap,
      }),
    [input.isDeliveryRoom, input.myRole, storeOrderSnap]
  );

  const deliveryPeerUserId = useMemo(
    () =>
      resolveDeliveryPeerUserId({
        peerUserId: input.peerUserId,
        viewerUserId: input.viewerUserId,
        memberIds: input.members.map((m) => m.id),
      }),
    [input.members, input.peerUserId, input.viewerUserId]
  );

  const peerProfile = useMemo(
    () => input.members.find((m) => m.id.trim() === deliveryPeerUserId) ?? null,
    [deliveryPeerUserId, input.members]
  );

  const [buyerPublicProfile, setBuyerPublicProfile] = useState<PublicSellerProfileDTO | null>(null);

  useEffect(() => {
    setBuyerPublicProfile(null);
  }, [deliveryPeerUserId, input.storeOrderId]);

  useEffect(() => {
    if (mode !== "owner_buyer_peer" || !deliveryPeerUserId) {
      setBuyerPublicProfile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(deliveryPeerUserId)}/public-profile`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          profile?: PublicSellerProfileDTO;
        };
        if (cancelled || !json?.ok || !json.profile?.id) return;
        setBuyerPublicProfile(json.profile);
      } catch {
        if (!cancelled) setBuyerPublicProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deliveryPeerUserId, mode, input.storeOrderId]);

  const buyerTrustPercent = useMemo(() => {
    if (buyerPublicProfile?.trustScore == null) return null;
    return mannerRawToPercent(clampTrustScore(buyerPublicProfile.trustScore));
  }, [buyerPublicProfile?.trustScore]);

  const buyerTrustTier = buyerTrustPercent != null ? mannerBatteryTier(buyerTrustPercent) : null;

  const buyerNickname = useMemo(() => {
    const fromApi =
      buyerPublicProfile?.nickname?.trim() || buyerPublicProfile?.display_name?.trim() || "";
    if (fromApi) return fromApi;
    return buyerNicknameForOwnerHeader(peerProfile?.label, input.roomTitle);
  }, [buyerPublicProfile?.display_name, buyerPublicProfile?.nickname, input.roomTitle, peerProfile?.label]);

  const buyerAvatarUrl =
    buyerPublicProfile?.avatar_url?.trim() ||
    peerProfile?.avatarUrl?.trim() ||
    input.roomAvatarUrl?.trim() ||
    null;

  const storeDisplayName =
    storeOrderSnap?.orderCard?.storeName?.trim() ||
    storeNameFromDeliveryHeadline(input.deliveryHeadline) ||
    input.roomTitle.trim() ||
    "매장";

  const storeAvatarUrl =
    storeOrderSnap?.storeProfileImageUrl?.trim() || input.thumbnailUrl?.trim() || null;

  return useMemo((): StoreOrderDeliveryMessengerHeaderModel => {
    if (mode === "owner_buyer_peer") {
      return {
        mode,
        showAvatar: true,
        avatarUrl: buyerAvatarUrl,
        avatarRounded: "circle",
        title: buyerNickname,
        subtitle: null,
        showPresence: true,
        buyerTrustPercent,
        buyerTrustTier,
      };
    }
    if (mode === "buyer_store") {
      return {
        mode,
        showAvatar: true,
        avatarUrl: storeAvatarUrl,
        avatarRounded: "store_rect",
        title: storeDisplayName,
        subtitle: null,
        showPresence: true,
        buyerTrustPercent: null,
        buyerTrustTier: null,
      };
    }
    if (mode === "generic_delivery") {
      return {
        mode,
        showAvatar: false,
        avatarUrl: null,
        avatarRounded: "circle",
        title: input.roomTitle,
        subtitle: null,
        showPresence: false,
        buyerTrustPercent: null,
        buyerTrustTier: null,
      };
    }
    return {
      mode: "none",
      showAvatar: false,
      avatarUrl: null,
      avatarRounded: "circle",
      title: input.roomTitle,
      subtitle: null,
      showPresence: false,
      buyerTrustPercent: null,
      buyerTrustTier: null,
    };
  }, [
    buyerAvatarUrl,
    buyerNickname,
    buyerTrustPercent,
    buyerTrustTier,
    input.roomTitle,
    mode,
    storeAvatarUrl,
    storeDisplayName,
  ]);
}
