"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChatProductSummary } from "@/components/chats/ChatProductSummary";
import { TradeFlowBanner } from "@/components/trade/TradeFlowBanner";
import {
  fetchChatRoomDetailApi,
  invalidateChatRoomDetailCache,
  peekChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import { bustChatRoomBootstrapFlights } from "@/lib/chats/fetch-chat-room-bootstrap-api";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { canOpenTradeReviewSheet } from "@/lib/trade/can-open-trade-review-sheet";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { normalizeSellerListingState, SELLER_LISTING_LABEL } from "@/lib/products/seller-listing-state";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { dispatchTradeListingThreadNotices } from "@/lib/chats/trade-listing-thread-sync";
import { useTradePostListingBroadcast } from "@/lib/chats/use-trade-post-listing-broadcast";
import type { TradePostListingBroadcastPayload } from "@/lib/trade/trade-post-listing-broadcast-channel";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";
import { usePostSellerListingRealtime } from "@/lib/chats/use-post-seller-listing-realtime";
import type { ChatRoom } from "@/lib/types/chat";
import { TradeReviewForm } from "@/components/trade/TradeReviewForm";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

function bustTradeCachesAfterReview(productChatId: string) {
  const k = productChatId.trim();
  if (!k) return;
  invalidateChatRoomDetailCache(k);
  forgetSingleFlight(`chat:room-detail:${k}`);
  bustChatRoomBootstrapFlights(k);
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const didAutoOpenReviewRef = useRef(false);
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

  const tradePostListingPayloadRef = useRef<(p: TradePostListingBroadcastPayload) => void>(() => {});

  useEffect(() => {
    tradePostListingPayloadRef.current = (p: TradePostListingBroadcastPayload) => {
      if (!postId || p.postId.trim() !== postId.trim()) return;
      const normalized = normalizeSellerListingState(
        p.sellerListingState,
        p.postStatus ?? room?.product?.status
      );
      setPostStatusFromRealtime(p.postStatus);
      setListingFromPostRealtime(normalized);
      void reload();
    };
  }, [postId, room?.product?.status, reload]);

  useTradePostListingBroadcast({
    postId: postId || null,
    enabled: Boolean(postId) && Boolean(viewerUserId?.trim()),
    onPayloadRef: tradePostListingPayloadRef,
  });

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
      if (amISeller) {
        const label = SELLER_LISTING_LABEL[state];
        if (typeof window !== "undefined" && !window.confirm(`물품의 상태를 "${label}"으로 변경할까요?`)) {
          return;
        }
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
          threadNotices?: TradeListingThreadNotice[];
        };
        if (!res.ok || !data.ok || !data.sellerListingState) {
          setListingError(String(data.error ?? "저장에 실패했습니다."));
          return;
        }
        const w = typeof data.warning === "string" ? data.warning.trim() : "";
        setListingNotice(w || null);
        setPinnedListing(data.sellerListingState as SellerListingState);
        setPinnedForProductId(postId);
        const threadNotices = Array.isArray(data.threadNotices) ? data.threadNotices : [];
        if (threadNotices.length > 0) {
          dispatchTradeListingThreadNotices({ postId, notices: threadNotices });
        }
        await reload();
        onTradeMetaChanged?.();
        dispatchTradeChatUnreadUpdated({
          source: "seller-listing-state",
          key: postId,
          roomId: room.id?.trim() || undefined,
        });
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

  const partnerId = room ? (room.buyerId === viewerUserId ? room.sellerId : room.buyerId) : "";
  const partnerLabel = room?.partnerNickname?.trim() || partnerId.slice(0, 8);

  useEffect(() => {
    if (searchParams.get("review") !== "1") return;
    if (!room || !canOpenReview || viewerUserId !== room.buyerId) return;
    if (didAutoOpenReviewRef.current) return;
    didAutoOpenReviewRef.current = true;
    setReviewSheetOpen(true);
    if (pathname) router.replace(pathname, { scroll: false });
  }, [searchParams, room, canOpenReview, viewerUserId, pathname, router]);

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
        onOpenReview={() => {
          if (viewerUserId === room.buyerId) setReviewSheetOpen(true);
        }}
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

      {reviewSheetOpen && room ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            className={`flex max-h-full min-h-0 w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface shadow-sam-elevated sm:max-h-[min(90vh,calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px)))] sm:rounded-ui-rect`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-sam-border-soft px-4 py-3">
              <h2 className="sam-text-body-lg font-semibold text-sam-fg">후기 작성</h2>
              <button type="button" onClick={() => setReviewSheetOpen(false)} className="sam-text-body text-sam-muted">
                닫기
              </button>
            </div>
            <TradeReviewForm
              effectiveProductChatId={effectiveProductChatId}
              productId={room.productId}
              revieweeId={partnerId}
              revieweeLabel={partnerLabel}
              roleType="buyer_to_seller"
              onSuccess={() => {
                setReviewSheetOpen(false);
                bustTradeCachesAfterReview(effectiveProductChatId);
                void reload();
                onTradeMetaChanged?.();
                router.refresh();
              }}
              onCancel={() => setReviewSheetOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
