"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import {
  patchTradeChatEntryMark,
  readTradeChatEntryMark,
} from "@/lib/chats/trade-chat-entry-client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import type { ChatRoomSource } from "@/lib/types/chat";

const LIST_HREF = TRADE_CHAT_SURFACE.messengerListHref;

export function TradeChatComposeClient({
  productId,
  initialRoomId,
  sourceHint,
}: {
  productId: string | null;
  initialRoomId: string | null;
  sourceHint: ChatRoomSource | null;
}) {
  const router = useRouter();
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(initialRoomId);
  /** createOrGetChatRoom 이 돌린 뒤 방 종류 — URL `source` 보다 우선 */
  const [hubBootstrapSource, setHubBootstrapSource] = useState<ChatRoomSource | null>(() =>
    initialRoomId ? sourceHint : null
  );
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
      /** 메신저 방 RSC 부트스트랩으로 이어짐 — 여기서 `/bootstrap` 을 또 호출하면 이중 왕복 */
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
        const next =
          productId.trim().length > 0 ? tradeHubChatComposeHref({ productId }) : undefined;
        if (redirectForBlockedAction(router, result.error, next)) return;
        setError(result.error || "채팅방을 열 수 없습니다.");
        return;
      }
      const dest = tradeHubChatRoomHref(result.roomId, result.roomSource);
      void router.prefetch(dest);
      setResolvedRoomId(result.roomId);
      setHubBootstrapSource(result.roomSource);
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
  }, [activeRoomId, productId, sourceHint, hubBootstrapSource]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (replaceStartedRef.current === activeRoomId) return;
    replaceStartedRef.current = activeRoomId;
    router.replace(tradeHubChatRoomHref(activeRoomId, hubBootstrapSource ?? sourceHint), {
      scroll: false,
    });
  }, [activeRoomId, router, hubBootstrapSource, sourceHint]);

  /** 방 ID 확정 후 메신저 방으로 `replace` — 이 compose 셸에서 `ChatRoomScreen` 을 마운트하지 않음 */
  if (activeRoomId) {
    return (
      <TradeChatLoadingShell
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
      label="채팅 준비 중..."
      description="대화방을 바로 열고 있어요."
    />
  );
}
