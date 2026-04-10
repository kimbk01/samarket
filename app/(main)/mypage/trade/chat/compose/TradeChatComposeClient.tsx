"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import {
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import {
  patchTradeChatEntryMark,
  readTradeChatEntryMark,
} from "@/lib/chats/trade-chat-entry-client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import type { ChatRoomSource } from "@/lib/types/chat";

const LIST_HREF = "/mypage/trade/chat";

export function TradeChatComposeClient({
  productId,
  initialRoomId,
  sourceHint,
  initialViewerUserId,
}: {
  productId: string | null;
  initialRoomId: string | null;
  sourceHint: ChatRoomSource | null;
  initialViewerUserId?: string | null;
}) {
  const router = useRouter();
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(initialRoomId);
  const [error, setError] = useState<string | null>(null);
  const replaceStartedRef = useRef<string | null>(null);
  const shellLoggedRef = useRef(false);

  const activeRoomId = useMemo(() => resolvedRoomId?.trim() || null, [resolvedRoomId]);

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
    if (activeRoomId) {
      warmChatRoomEntryById(activeRoomId, sourceHint);
      return;
    }
    if (!productId) {
      setError("채팅 상품 정보가 없습니다.");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await createOrGetChatRoom(productId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error || "채팅방을 열 수 없습니다.");
        return;
      }
      setResolvedRoomId(result.roomId);
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
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRoomId, productId, sourceHint]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (replaceStartedRef.current === activeRoomId) return;
    replaceStartedRef.current = activeRoomId;
    startTransition(() => {
      router.replace(tradeHubChatRoomHref(activeRoomId), { scroll: false });
    });
  }, [activeRoomId, router]);

  if (activeRoomId) {
    return (
      <ChatRoomScreen
        roomId={activeRoomId}
        listHref={LIST_HREF}
        initialViewerUserId={initialViewerUserId}
        tradeHubColumnLayout
        chatRoomSourceHint={sourceHint}
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
      label="채팅 준비 중..."
      description="대화방을 바로 열고 있어요."
    />
  );
}
