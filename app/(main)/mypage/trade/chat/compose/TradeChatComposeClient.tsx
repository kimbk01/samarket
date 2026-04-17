"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { patchTradeChatEntryMark, readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import { emitTradeChatRoomResolved } from "@/lib/chats/trade-chat-room-resolved-event";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { requestMessengerHomeListMergeFromHomeSummary } from "@/lib/community-messenger/request-messenger-home-list-merge-from-summary";

const LIST_HREF = TRADE_CHAT_SURFACE.messengerListHref;

export function TradeChatComposeClient({
  productId,
}: {
  productId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** 방 ID 확정 후 짧게 "이동 중" 표시 — 라우트 전환 전까지 */
  const [goingRoomId, setGoingRoomId] = useState<string | null>(null);
  const replaceStartedRef = useRef<string | null>(null);
  const shellLoggedRef = useRef(false);

  useEffect(() => {
    if (shellLoggedRef.current) return;
    shellLoggedRef.current = true;
    const mark = readTradeChatEntryMark();
    if (!mark || mark.shellShownAt) return;
    const next = patchTradeChatEntryMark({ shellShownAt: Date.now() });
    if (!next) return;
    logClientPerf("chat-entry.shell-open", {
      mode: next.mode,
      productId: next.productId,
      roomId: next.roomId,
      elapsedMs: Math.max(0, next.shellShownAt! - next.startedAt),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await createOrGetChatRoom(productId);
      if (cancelled) return;
      if (result.ok && result.roomId) {
        if (replaceStartedRef.current === result.roomId) return;
        replaceStartedRef.current = result.roomId;
        setGoingRoomId(result.roomId);
        const mark = patchTradeChatEntryMark({
          roomId: result.roomId,
          roomResolvedAt: Date.now(),
        });
        if (mark?.roomResolvedAt) {
          logClientPerf("chat-entry.room-resolved", {
            mode: mark.mode,
            productId: mark.productId,
            roomId: result.roomId,
            elapsedMs: Math.max(0, mark.roomResolvedAt - mark.startedAt),
          });
        }
        emitTradeChatRoomResolved({
          productId,
          roomId: result.roomId,
          messengerRoomId: result.messengerRoomId ?? null,
          roomSource: result.roomSource,
        });
        const cmForList = result.messengerRoomId?.trim();
        if (cmForList) void requestMessengerHomeListMergeFromHomeSummary(cmForList, "trade_chat_entry_room_ready");
        const navRoomId = result.messengerRoomId?.trim() || result.roomId;
        router.replace(tradeHubChatRoomHref(navRoomId, result.roomSource), { scroll: false });
        return;
      }
      const next = tradeHubChatComposeHref({ productId });
      const errMsg = !result.ok ? result.error : "채팅방을 열 수 없습니다.";
      if (redirectForBlockedAction(router, errMsg, next)) return;
      setError(errMsg);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, router]);

  if (goingRoomId) {
    return (
      <TradeChatLoadingShell
        variant="creating"
        label="채팅으로 이동 중..."
        description="대화방을 열고 있어요."
      />
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => router.replace(LIST_HREF)}
          className="mt-3 font-medium text-signature underline"
        >
          목록으로
        </button>
      </div>
    );
  }

  return (
    <TradeChatLoadingShell
      variant="creating"
      label="거래 채팅 방 생성중"
      description="연결되는 동안 잠시만 기다려 주세요."
    />
  );
}
