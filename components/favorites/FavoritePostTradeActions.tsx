"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createOrGetChatRoom, prepareTradeChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { TRADE_CHAT_SURFACE, tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const tradeChatPrepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id || post.type === "community") {
      setExistingRoomId(null);
      setExistingRoomSource(null);
      return;
    }
    if (listingOwnerId && user.id === listingOwnerId) {
      setExistingRoomId(null);
      setExistingRoomSource(null);
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
      })
      .catch(() => {
        if (!cancelled) {
          setExistingRoomId(null);
          setExistingRoomSource(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.type, user?.id, listingOwnerId, authBump]);

  useEffect(() => {
    if (!user?.id || post.type === "community") return;
    void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);
    if (existingRoomId) {
      void router.prefetch(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
    }
  }, [existingRoomId, existingRoomSource, post.type, router, user?.id]);

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
    chatLoading ||
    chatBlockedByOtherReservation ||
    (isSold && !allowChatAfterSold && !existingRoomId);

  const scheduleTradeChatPrepare = useCallback(() => {
    if (!showChat || existingRoomId) return;
    if (chatBlockedByOtherReservation) return;
    if (isSold && !allowChatAfterSold) return;
    if (tradeChatPrepareTimerRef.current) clearTimeout(tradeChatPrepareTimerRef.current);
    tradeChatPrepareTimerRef.current = setTimeout(() => {
      tradeChatPrepareTimerRef.current = null;
      prepareTradeChatRoom(post.id);
    }, 180);
  }, [
    showChat,
    existingRoomId,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    post.id,
  ]);

  const cancelTradeChatPrepare = useCallback(() => {
    if (tradeChatPrepareTimerRef.current) {
      clearTimeout(tradeChatPrepareTimerRef.current);
      tradeChatPrepareTimerRef.current = null;
    }
  }, []);

  const handleChat = useCallback(async () => {
    setChatError("");
    const me = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, me)) return;
    if (post.type === "community") return;
    if (existingRoomId) {
      warmChatRoomEntryById(existingRoomId, existingRoomSource);
      router.push(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
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
    setChatLoading(true);
    const res = await createOrGetChatRoom(post.id);
    setChatLoading(false);
    if (res.ok) {
      warmChatRoomEntryById(res.roomId, res.roomSource);
      router.push(tradeHubChatRoomHref(res.roomId, res.roomSource));
    } else {
      if (redirectForBlockedAction(router, res.error)) return;
      setChatError(res.error ?? "채팅방을 열 수 없습니다.");
    }
  }, [
    router,
    post.id,
    post.type,
    existingRoomId,
    existingRoomSource,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    setChatError,
    setChatLoading,
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
              void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);
              if (existingRoomId) {
                void router.prefetch(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
                warmChatRoomEntryById(existingRoomId, existingRoomSource);
              }
            }}
            onPointerLeave={cancelTradeChatPrepare}
            onPointerDown={cancelTradeChatPrepare}
            disabled={chatDisabled}
            title={
              chatBlockedByOtherReservation
                ? "다른 구매자와 예약이 진행 중입니다"
                : undefined
            }
            className={BTN_PRIMARY}
          >
            {chatLoading ? "이동 중…" : tradeChatCtaLabel}
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
