"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { notifyCmTradeDockLayoutChange } from "@/lib/community-messenger/room/cm-trade-dock-layout";
import { ChatProductSummary } from "@/components/chats/ChatProductSummary";
import { TradeFlowBanner } from "@/components/trade/TradeFlowBanner";
import {
  fetchChatRoomDetailApi,
  invalidateChatRoomDetailCache,
  peekChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  normalizeSellerListingState,
  sellerListingStateMessageKey,
} from "@/lib/products/seller-listing-state";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { dispatchTradeListingThreadNotices } from "@/lib/chats/trade-listing-thread-sync";
import { useTradePostListingBroadcast } from "@/lib/chats/use-trade-post-listing-broadcast";
import type { TradePostListingBroadcastPayload } from "@/lib/trade/trade-post-listing-broadcast-channel";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";
import { usePostSellerListingRealtime } from "@/lib/chats/use-post-seller-listing-realtime";
import type { ChatRoom } from "@/lib/types/chat";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  productChatId: string;
  viewerUserId: string;
  /** RSC·부트스트랩 스냅샷에 포함된 거래 방 — 있으면 초기 네트워크 대기 생략 */
  initialTradeChatRoom?: ChatRoom | null;
  /** 거래 상태 변경 후 메신저 방 스냅샷·목록 동기화 */
  onTradeMetaChanged?: () => void;
  /** 모바일 키보드 크롬 — 단계 접기·상품 카드 숨김 */
  keyboardCompact?: boolean;
  /** 메신저 셸: 헤더 아래(legacy) vs 입력란 바로 위 */
  dockPlacement?: "belowHeader" | "aboveComposer";
  /** Marketplace banner already shows the listing — do not duplicate above composer. */
  hideProductCard?: boolean;
};

/**
 * STRUCTURAL AUTHORITY LOCK PASS (2026-08-07): Process UI = S1 이 섹션.
 * docs/trade-community-structural-authority-lock.md
 * ChatDetailView TradeFlowBanner 경로는 Bridge — Exit 조건 충족 전 제거 금지.
 *
 * 메신저 1:1 방에서 중고 거래(product_chats) — 기존 거래 채팅과 동일 TradeFlowBanner·상품 카드.
 */
export function CommunityMessengerTradeProcessSection({
  productChatId,
  viewerUserId,
  initialTradeChatRoom = null,
  onTradeMetaChanged,
  keyboardCompact = false,
  dockPlacement = "belowHeader",
  hideProductCard = false,
}: Props) {
  const { t } = useI18n();
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
      setLoadError(t("cm_ui_failed_to_load_trade_info"));
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
          setLoadError(t("cm_ui_failed_to_load_trade_info"));
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
        const label = t(sellerListingStateMessageKey(state));
        if (!(await dibayConfirm({ title: t("cm_ui_confirm_change_item_status", { label }), cancelLabel: t("common_cancel"), confirmLabel: t("common_confirm") }))) {
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
          setListingError(String(data.error ?? t("common_save_failed")));
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
        setListingError(t("common_network_error_retry"));
      } finally {
        setListingSaving(false);
      }
    },
    [room, postId, displayListing, amISeller, reload, onTradeMetaChanged, t]
  );

  const onActionDone = useCallback(async () => {
    await reload();
    onTradeMetaChanged?.();
  }, [reload, onTradeMetaChanged]);

  useLayoutEffect(() => {
    if (!room) return;
    notifyCmTradeDockLayoutChange("trade_dock_content");
  }, [room, keyboardCompact, loading]);

  if (loading) {
    return (
      <div className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">
        {t("cm_ui_loading_trade_info")}
      </div>
    );
  }

  if (loadError || !room) {
    return (
      <div className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 sam-text-helper text-amber-900">
        {loadError ?? t("cm_ui_cannot_display_trade_info")}
      </div>
    );
  }

  const dockBorderClass =
    dockPlacement === "aboveComposer"
      ? "border-t border-[color:var(--cm-room-divider)]"
      : "border-b border-[color:var(--cm-room-divider)]";

  return (
    <div
      data-cm-trade-dock
      data-cm-trade-dock-placement={dockPlacement}
      data-cm-trade-dock-collapsed={keyboardCompact ? "true" : undefined}
      className={`shrink-0 bg-[color:var(--cm-room-header-bg)] ${dockBorderClass}`}
    >
      <TradeFlowBanner
        room={room}
        currentUserId={viewerUserId}
        effectiveProductChatId={effectiveProductChatId}
        onActionDone={() => void onActionDone()}
        displayListing={displayListing}
        onPersistListing={persistListingState}
        listingSaving={listingSaving}
        listingError={listingError}
        listingNotice={listingNotice}
        productStatusOverride={displayProductStatus}
        sellerListingControlsEnabled
        layoutVariant={keyboardCompact ? "keyboardCompact" : "default"}
        onDiagramExpandedChange={() => notifyCmTradeDockLayoutChange("diagram_expand")}
      />
      {room.product && !keyboardCompact && !hideProductCard ? (
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
