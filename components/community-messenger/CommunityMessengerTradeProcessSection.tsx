"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatProductSummary } from "@/components/chats/ChatProductSummary";
import { TradeFlowBanner } from "@/components/trade/TradeFlowBanner";
import {
  fetchChatRoomDetailApi,
  invalidateChatRoomDetailCache,
  peekChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { canOpenTradeReviewSheet } from "@/lib/trade/can-open-trade-review-sheet";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { normalizeSellerListingState, SELLER_LISTING_LABEL } from "@/lib/products/seller-listing-state";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { usePostSellerListingRealtime } from "@/lib/chats/use-post-seller-listing-realtime";
import type { ChatRoom } from "@/lib/types/chat";

type Props = {
  productChatId: string;
  viewerUserId: string;
  /** RSC·부트스트랩 스냅샷에 포함된 거래 방 — 있으면 초기 네트워크 대기 생략 */
  initialTradeChatRoom?: ChatRoom | null;
  /** 거래 상태 변경 후 메신저 방 스냅샷·목록 동기화 */
  onTradeMetaChanged?: () => void;
  /** 모바일 키보드 크롬 — 단계 접기·상품 카드 숨김 */
  keyboardCompact?: boolean;
};

/**
 * 메신저 1:1 방에서 중고 거래(product_chats) — 기존 거래 채팅과 동일 TradeFlowBanner·상품 카드.
 */
export function CommunityMessengerTradeProcessSection({
  productChatId,
  viewerUserId,
  initialTradeChatRoom = null,
  onTradeMetaChanged,
  keyboardCompact = false,
}: Props) {
  const router = useRouter();
  const initialId = productChatId.trim();
  const [room, setRoom] = useState<ChatRoom | null>(() => {
    if (initialTradeChatRoom) return initialTradeChatRoom;
    return initialId ? peekChatRoomDetailMemory(initialId) ?? null : null;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    if (initialTradeChatRoom) return false;
    return Boolean(initialId && !peekChatRoomDetailMemory(initialId));
  });
  const [listingSaving, setListingSaving] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingNotice, setListingNotice] = useState<string | null>(null);
  const [pinnedListing, setPinnedListing] = useState<SellerListingState | null>(null);
  const [pinnedForProductId, setPinnedForProductId] = useState<string | null>(null);
  const [listingFromPostRealtime, setListingFromPostRealtime] = useState<SellerListingState | null>(null);

  const reload = useCallback(async () => {
    const id = productChatId.trim();
    if (!id) return;
    invalidateChatRoomDetailCache(id);
    const r = await fetchChatRoomDetailApi(id);
    if (r.ok) {
      setRoom(r.room);
      setLoadError(null);
    } else {
      setRoom(null);
      setLoadError(r.code === "not_found" ? "거래 정보를 불러오지 못했습니다." : "거래 정보를 불러오지 못했습니다.");
    }
  }, [productChatId]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const id = productChatId.trim();
    if (!id) {
      setRoom(null);
      setLoading(false);
      return;
    }
    if (initialTradeChatRoom) {
      setRoom(initialTradeChatRoom);
      setLoading(false);
      setLoadError(null);
      return;
    }
    const warm = peekChatRoomDetailMemory(id);
    if (warm) {
      setRoom(warm);
      setLoading(false);
      return;
    }
    setLoading(true);
    /** 부모 `MessengerTradeChatRoomDetailPrefetch` 와 한 틱 내 캐시 합류를 허용 */
    void queueMicrotask(() => {
      if (cancelled) return;
      const again = peekChatRoomDetailMemory(id);
      if (again) {
        setRoom(again);
        setLoading(false);
        return;
      }
      void (async () => {
        const r = await fetchChatRoomDetailApi(id);
        if (cancelled) return;
        if (r.ok) {
          setRoom(r.room);
        } else {
          setRoom(null);
          setLoadError("거래 정보를 불러오지 못했습니다.");
        }
        setLoading(false);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [productChatId, initialTradeChatRoom]);

  const postId = (room?.product?.id ?? room?.productId ?? "").trim();
  const propListing = normalizeSellerListingState(room?.product?.sellerListingState, room?.product?.status);
  const [postStatusFromRealtime, setPostStatusFromRealtime] = useState<string | null>(null);
  const amISeller = room ? room.sellerId === viewerUserId : false;

  usePostSellerListingRealtime({
    postId: postId || null,
    enabled: Boolean(postId) && Boolean(viewerUserId?.trim()),
    onSellerListingState: ({ sellerListingState, postStatus }) => {
      setPostStatusFromRealtime(postStatus);
      setListingFromPostRealtime(normalizeSellerListingState(sellerListingState, postStatus ?? room?.product?.status));
    },
  });

  useEffect(() => {
    setListingFromPostRealtime(null);
    setPostStatusFromRealtime(null);
  }, [productChatId, postId]);

  useEffect(() => {
    if (listingFromPostRealtime == null) return;
    if (listingFromPostRealtime === propListing) {
      setListingFromPostRealtime(null);
    }
  }, [propListing, listingFromPostRealtime]);

  useEffect(() => {
    if (!amISeller || listingFromPostRealtime == null || !postId) return;
    if (pinnedForProductId !== postId || pinnedListing == null) return;
    if (pinnedListing !== listingFromPostRealtime) {
      setPinnedListing(null);
      setPinnedForProductId(null);
    }
  }, [amISeller, listingFromPostRealtime, postId, pinnedForProductId, pinnedListing]);

  const displayListing: SellerListingState =
    amISeller && pinnedListing != null && pinnedForProductId === postId && postId
      ? pinnedListing
      : listingFromPostRealtime ?? propListing;
  const displayProductStatus = (postStatusFromRealtime ?? room?.product?.status ?? "").trim();

  const effectiveProductChatId = (room?.productChatRoomId || room?.id || productChatId).trim();

  const persistListingState = useCallback(
    async (state: SellerListingState) => {
      if (!room || !postId || state === displayListing) return;
      const label = SELLER_LISTING_LABEL[state];
      if (typeof window !== "undefined" && !window.confirm(`물품의 상태를 "${label}"으로 선택하시겠습니까?`)) {
        return;
      }
      setListingSaving(true);
      setListingError(null);
      setListingNotice(null);
      try {
        const body: { sellerListingState: SellerListingState; reservedBuyerId?: string } = {
          sellerListingState: state,
        };
        if (state === "reserved" && amISeller && room.buyerId?.trim()) {
          body.reservedBuyerId = room.buyerId.trim();
        }
        const res = await fetch(`/api/posts/${postId}/seller-listing-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          sellerListingState?: string;
          warning?: string;
        };
        if (!res.ok || !data.ok || !data.sellerListingState) {
          setListingError(String(data.error ?? "저장에 실패했습니다."));
          return;
        }
        const w = typeof data.warning === "string" ? data.warning.trim() : "";
        setListingNotice(w || null);
        setPinnedListing(data.sellerListingState as SellerListingState);
        setPinnedForProductId(postId);
        await reload();
        onTradeMetaChanged?.();
        dispatchTradeChatUnreadUpdated({ source: "seller-listing-state", key: postId });
      } catch {
        setListingError("네트워크 오류로 저장하지 못했습니다.");
      } finally {
        setListingSaving(false);
      }
    },
    [room, postId, displayListing, amISeller, reload, onTradeMetaChanged]
  );

  const onActionDone = useCallback(async () => {
    await reload();
    onTradeMetaChanged?.();
  }, [reload, onTradeMetaChanged]);

  const openReviewOnChatsShell = useCallback(() => {
    if (!effectiveProductChatId) return;
    router.push(tradeHubChatRoomHref(effectiveProductChatId, "product_chat", { review: true }));
  }, [router, effectiveProductChatId]);

  const canOpenReview =
    room &&
    canOpenTradeReviewSheet({
      currentUserId: viewerUserId,
      roomSellerId: room.sellerId,
      roomBuyerId: room.buyerId,
        productStatus: displayProductStatus || room.product?.status,
      sellerListingState: room.product?.sellerListingState,
      ...(amISeller && pinnedListing != null && pinnedForProductId === postId && postId
        ? { sellerListingOverride: pinnedListing }
        : {}),
      tradeFlowStatus: room.tradeFlowStatus,
      soldBuyerId: room.soldBuyerId ?? null,
      buyerReviewSubmitted: room.buyerReviewSubmitted === true,
    });

  if (loading) {
    return (
      <div className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">
        거래 정보를 불러오는 중…
      </div>
    );
  }

  if (loadError || !room) {
    return (
      <div className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 sam-text-helper text-amber-900">
        {loadError ?? "거래 정보를 표시할 수 없습니다."}
      </div>
    );
  }

  return (
    <div data-cm-trade-dock className="shrink-0 border-b border-[color:var(--cm-room-divider)]">
      <TradeFlowBanner
        room={room}
        currentUserId={viewerUserId}
        effectiveProductChatId={effectiveProductChatId}
        onActionDone={() => void onActionDone()}
        onOpenReview={openReviewOnChatsShell}
        canOpenReviewSheet={Boolean(canOpenReview)}
        displayListing={displayListing}
        onPersistListing={persistListingState}
        listingSaving={listingSaving}
        listingError={listingError}
        listingNotice={listingNotice}
        productStatusOverride={displayProductStatus}
        sellerListingControlsEnabled
        layoutVariant={keyboardCompact ? "keyboardCompact" : "default"}
      />
      {room.product && !keyboardCompact ? (
        <div className="border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-1.5">
          <ChatProductSummary
            variant="messengerDock"
            product={room.product}
            hideFavorite={amISeller}
            sellerUserId={room.sellerId}
            productStatusOverride={displayProductStatus}
            sellerListingStateOverride={postId ? displayListing : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
