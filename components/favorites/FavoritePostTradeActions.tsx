"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { getAppSettings } from "@/lib/app-settings";
import { POST_DETAIL_SELLER_ANCHOR_ID } from "@/lib/posts/post-detail-anchors";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";

const tradeRoomPath = (roomId: string) =>
  `${TRADE_CHAT_SURFACE.hubPath}/${encodeURIComponent(roomId)}`;

const BTN_SECONDARY =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100";
const BTN_PRIMARY =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-signature px-3 text-[13px] font-medium text-white hover:opacity-95 disabled:opacity-45";

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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    if (!user?.id || post.type === "community") {
      setExistingRoomId(null);
      return;
    }
    if (listingOwnerId && user.id === listingOwnerId) {
      setExistingRoomId(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(post.id)}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { roomId: null }))
      .then((data) => {
        if (!cancelled) setExistingRoomId(typeof data?.roomId === "string" ? data.roomId : null);
      })
      .catch(() => {
        if (!cancelled) setExistingRoomId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.type, user?.id, listingOwnerId, authBump]);

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

  const handleChat = useCallback(async () => {
    setChatError("");
    const me = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, me)) return;
    if (post.type === "community") return;
    if (existingRoomId) {
      router.push(tradeRoomPath(existingRoomId));
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
      router.push(tradeRoomPath(res.roomId));
    } else {
      if (redirectForBlockedAction(router, res.error)) return;
      setChatError(res.error ?? "채팅방을 열 수 없습니다.");
    }
  }, [
    router,
    post.id,
    post.type,
    existingRoomId,
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
