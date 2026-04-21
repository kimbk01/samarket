"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import {
  openCreateTradeChat,
  openExistingTradeChat,
  prefetchTradeChatEntry,
} from "@/lib/chats/trade-chat-entry-navigation";
import {
  KASAMA_TRADE_CHAT_ROOM_RESOLVED,
  type TradeChatRoomResolvedDetail,
} from "@/lib/chats/trade-chat-room-resolved-event";
import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { getAppSettings } from "@/lib/app-settings";
import { POST_DETAIL_SELLER_ANCHOR_ID } from "@/lib/posts/post-detail-anchors";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";

const BTN_SECONDARY =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-medium text-sam-fg hover:bg-sam-app active:bg-sam-surface-muted";
const BTN_PRIMARY =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-ui-rect bg-signature px-3 text-[13px] font-medium text-white hover:opacity-95 disabled:opacity-45";

/**
 * 찜 목록 카드 하단 — 거래 채팅·상세의 판매자 영역으로 이동
 */
export function FavoritePostTradeActions({ post }: { post: FavoritedPost }) {
  const router = useRouter();
  const [authBump, setAuthBump] = useState(0);
  useEffect(() => {
    const bump = () => setAuthBump((n) => n + 1);
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, bump);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, bump);
  }, []);

  const user = getCurrentUser();
  const appSettings = getAppSettings();
  const chatEnabled = appSettings.chatEnabled !== false;
  const allowChatAfterSold = appSettings.allowChatAfterSold === true;

  const listingOwnerId = postAuthorUserId(post as unknown as Record<string, unknown>);
  const isOwnPost = Boolean(user?.id && listingOwnerId && user.id === listingOwnerId);
  const isSold = post.status === "sold";

  const [existingRoomId, setExistingRoomId] = useState<string | null>(null);
  const [existingRoomSource, setExistingRoomSource] = useState<ChatRoomSource | null>(null);
  const [existingMessengerRoomId, setExistingMessengerRoomId] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");
  const tradeChatPrepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id || post.type === "community") {
      setExistingRoomId(null);
      setExistingRoomSource(null);
      setExistingMessengerRoomId(null);
      return;
    }
    if (listingOwnerId && user.id === listingOwnerId) {
      setExistingRoomId(null);
      setExistingRoomSource(null);
      setExistingMessengerRoomId(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(post.id)}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { roomId: null }))
      .then((data) => {
        if (cancelled) return;
        setExistingRoomId(typeof data?.roomId === "string" ? data.roomId : null);
        setExistingRoomSource(
          data?.source === "chat_room" || data?.source === "product_chat" ? data.source : null
        );
        const mid = typeof data?.messengerRoomId === "string" ? data.messengerRoomId.trim() : "";
        setExistingMessengerRoomId(mid || null);
      })
      .catch(() => {
        if (!cancelled) {
          setExistingRoomId(null);
          setExistingRoomSource(null);
          setExistingMessengerRoomId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.type, user?.id, listingOwnerId, authBump]);

  useEffect(() => {
    const onRoomResolved = (ev: Event) => {
      const d = (ev as CustomEvent<TradeChatRoomResolvedDetail>).detail;
      if (!d?.productId || d.productId !== post.id) return;
      setExistingRoomId(d.roomId.trim());
      setExistingRoomSource(d.roomSource === "product_chat" ? "product_chat" : "chat_room");
      const mid = typeof d.messengerRoomId === "string" ? d.messengerRoomId.trim() : "";
      setExistingMessengerRoomId(mid || null);
    };
    window.addEventListener(KASAMA_TRADE_CHAT_ROOM_RESOLVED, onRoomResolved);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_ROOM_RESOLVED, onRoomResolved);
  }, [post.id]);

  useEffect(() => {
    if (!user?.id || post.type === "community") return;
    prefetchTradeChatEntry(router, {
      productId: post.id,
      existingRoomId,
      existingRoomSource,
      existingMessengerRoomId,
    });
  }, [existingRoomId, existingRoomSource, existingMessengerRoomId, post.type, router, user?.id]);

  const chatBlockedByOtherReservation =
    post.type === "community"
      ? false
      : !user?.id
        ? false
        : listingOwnerId && user.id === listingOwnerId
          ? false
          : existingRoomId
            ? false
            : shouldBlockNewItemChatForBuyer(post as unknown as Record<string, unknown>, user.id);

  const showChat =
    chatEnabled && post.type !== "community" && !isOwnPost;

  const tradeChatCtaLabel =
    post.type !== "community" && existingRoomId ? "채팅 이어가기" : "채팅하기";

  const chatDisabled =
    chatBlockedByOtherReservation ||
    (isSold && !allowChatAfterSold && !existingRoomId);

  const scheduleTradeChatPrepare = useCallback(() => {
    if (!showChat || existingRoomId) return;
    if (chatBlockedByOtherReservation) return;
    if (isSold && !allowChatAfterSold) return;
    if (tradeChatPrepareTimerRef.current) clearTimeout(tradeChatPrepareTimerRef.current);
    tradeChatPrepareTimerRef.current = setTimeout(() => {
      tradeChatPrepareTimerRef.current = null;
      prefetchTradeChatEntry(router, {
        productId: post.id,
        existingRoomId,
        existingRoomSource,
        existingMessengerRoomId,
        prepareIfCreate: true,
      });
    }, 180);
  }, [
    showChat,
    existingRoomId,
    existingRoomSource,
    existingMessengerRoomId,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    post.id,
    router,
  ]);

  const cancelTradeChatPrepare = useCallback(() => {
    if (tradeChatPrepareTimerRef.current) {
      clearTimeout(tradeChatPrepareTimerRef.current);
      tradeChatPrepareTimerRef.current = null;
    }
  }, []);

  const onTradeChatPointerDown = useCallback(() => {
    cancelTradeChatPrepare();
    if (
      showChat &&
      !existingRoomId &&
      !chatBlockedByOtherReservation &&
      (!isSold || allowChatAfterSold)
    ) {
      void prefetchTradeChatEntry(router, {
        productId: post.id,
        existingRoomId,
        existingRoomSource,
        existingMessengerRoomId,
        prepareIfCreate: true,
      });
    } else {
      void prefetchTradeChatEntry(router, {
        productId: post.id,
        existingRoomId,
        existingRoomSource,
        existingMessengerRoomId,
      });
    }
  }, [
    cancelTradeChatPrepare,
    showChat,
    existingRoomId,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    router,
    post.id,
    existingRoomSource,
    existingMessengerRoomId,
  ]);

  const handleChat = useCallback(() => {
    setChatError("");
    const me = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, me)) return;
    if (post.type === "community") return;
    if (existingRoomId) {
      openExistingTradeChat(router, {
        productId: post.id,
        roomId: existingRoomId,
        messengerRoomId: existingMessengerRoomId,
        sourceHint: existingRoomSource,
      });
      return;
    }
    if (chatBlockedByOtherReservation) {
      setChatError("다른 분과 예약이 진행 중인 상품입니다.");
      return;
    }
    if (isSold && !allowChatAfterSold) {
      setChatError("거래가 완료된 상품은 새 채팅을 열 수 없습니다.");
      return;
    }
    openCreateTradeChat(router, { productId: post.id });
  }, [
    router,
    post.id,
    post.type,
    existingRoomId,
    existingRoomSource,
    existingMessengerRoomId,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    setChatError,
  ]);

  const sellerHref = `/post/${post.id}#${POST_DETAIL_SELLER_ANCHOR_ID}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {showChat ? (
          <button
            type="button"
            onClick={() => void handleChat()}
            onPointerEnter={() => {
              scheduleTradeChatPrepare();
              prefetchTradeChatEntry(router, {
                productId: post.id,
                existingRoomId,
                existingRoomSource,
                existingMessengerRoomId,
              });
            }}
            onPointerLeave={cancelTradeChatPrepare}
            onPointerDown={onTradeChatPointerDown}
            disabled={chatDisabled}
            title={
              chatBlockedByOtherReservation
                ? "다른 구매자와 예약이 진행 중입니다"
                : undefined
            }
            className={BTN_PRIMARY}
          >
            {tradeChatCtaLabel}
          </button>
        ) : null}
        <Link href={sellerHref} className={showChat ? BTN_SECONDARY : `${BTN_SECONDARY} flex-[2]`}>
          판매자 정보
        </Link>
      </div>
      {chatError ? <p className="text-[12px] text-red-600">{chatError}</p> : null}
    </div>
  );
}
