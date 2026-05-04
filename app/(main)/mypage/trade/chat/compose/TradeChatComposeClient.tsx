"use client";

/**
 * 신규 거래 채팅: 상품 상세는 여기로만 온다 — `openCreateTradeChat` 가 방 생성을 기다리지 않음.
 * resolve 전에 상품 shell 즉시 표시 → 백그라운드 room 확정 후 메신저 방으로 replace.
 * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";
import { TradeChatComposePreparingShell } from "@/components/chats/TradeChatComposePreparingShell";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { patchTradeChatEntryMark, readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import { emitTradeChatRoomResolved } from "@/lib/chats/trade-chat-room-resolved-event";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { requestMessengerHomeListMergeFromHomeSummary } from "@/lib/community-messenger/request-messenger-home-list-merge-from-summary";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { readTradeChatComposePreview } from "@/lib/chats/trade-chat-compose-preview-client";

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
  const resolveLoggedRef = useRef(false);
  const replaceLoggedRef = useRef(false);
  const [resolveTick, setResolveTick] = useState(0);

  const preview = useMemo(() => {
    if (typeof window === "undefined") return null;
    return readTradeChatComposePreview(productId);
  }, [productId]);

  useLayoutEffect(() => {
    const mark = readTradeChatEntryMark();
    const origin = mark?.startedAt ?? Date.now();
    logClientPerf("trade_chat.metrics", {
      trade_chat_compose_shell_visible_ms: Date.now() - origin,
      productId,
    });
  }, [productId]);

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
    setError(null);
    void (async () => {
      const result = await createOrGetChatRoom(productId);
      if (cancelled) return;

      if (!resolveLoggedRef.current) {
        resolveLoggedRef.current = true;
        const mark0 = readTradeChatEntryMark();
        const origin0 = mark0?.startedAt ?? Date.now();
        logClientPerf("trade_chat.metrics", {
          trade_chat_resolve_done_ms: Date.now() - origin0,
          productId,
        });
      }

      if (result.ok && result.roomId) {
        if (replaceStartedRef.current === result.roomId) return;
        replaceStartedRef.current = result.roomId;
        if (!replaceLoggedRef.current) {
          replaceLoggedRef.current = true;
          const mark1 = readTradeChatEntryMark();
          const origin1 = mark1?.startedAt ?? Date.now();
          logClientPerf("trade_chat.metrics", {
            trade_chat_replace_start_ms: Date.now() - origin1,
            productId,
          });
        }
        setGoingRoomId(result.roomId);
        warmChatRoomEntryById(result.roomId, result.roomSource);
        const navRoomId = result.messengerRoomId?.trim() || result.roomId;
        if (result.messengerRoomId?.trim()) {
          void prefetchCommunityMessengerRoomSnapshot(result.messengerRoomId.trim());
        }
        const dest = tradeHubChatRoomHref(navRoomId, result.roomSource);
        void router.prefetch(dest);
        const mark = patchTradeChatEntryMark({
          roomId: result.roomId,
          sourceHint: result.roomSource,
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
        router.replace(dest, { scroll: false });
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
  }, [productId, router, resolveTick]);

  const handleRetry = () => {
    resolveLoggedRef.current = false;
    replaceLoggedRef.current = false;
    replaceStartedRef.current = null;
    setError(null);
    setResolveTick((n) => n + 1);
  };

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
      <TradeChatComposePreparingShell
        preview={preview}
        errorBanner={{ message: error, onRetry: handleRetry }}
      />
    );
  }

  return <TradeChatComposePreparingShell preview={preview} />;
}
