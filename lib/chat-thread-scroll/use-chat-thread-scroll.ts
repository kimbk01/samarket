"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  ChatThreadScrollEngine,
  createChatThreadScrollEngine,
  type NotifyEntryInput,
  type NotifyPrependCompleteInput,
} from "@/lib/chat-thread-scroll/engine";
import type {
  ChatThreadScrollEngineConfig,
  ChatThreadVirtualizer,
} from "@/lib/chat-thread-scroll/types";

export type UseChatThreadScrollOptions = ChatThreadScrollEngineConfig & {
  messageCount: number;
  virtualizer?: ChatThreadVirtualizer | null;
  /** 진입 시 tail bottom (기본 true) */
  entryForceBottom?: boolean;
  /** shell/composer layout commit 이벤트명 — CM: CM_ROOM_CHROME_HEIGHT_SYNC_EVENT */
  layoutCommittedEventName?: string;
  /** messages 로드 완료 여부 */
  messagesReady?: boolean;
  /** prepend fetch 진행 중 */
  prependInFlight?: boolean;
  /** 진입 1회 트리거 */
  entryActive?: boolean;
};

export type ChatThreadScrollController = {
  viewportRef: RefObject<HTMLDivElement | null>;
  notifyUserScroll: () => void;
  notifyLayoutCommitted: () => void;
  scrollToBottomExplicit: () => void;
  notifyPrependComplete: (input: NotifyPrependCompleteInput) => void;
  notifyEntry: (input?: NotifyEntryInput) => void;
  engine: ChatThreadScrollEngine;
};

function buildContext(
  viewport: HTMLElement | null,
  messageCount: number,
  virtualizer?: ChatThreadVirtualizer | null
) {
  return { viewport, messageCount, virtualizer: virtualizer ?? null };
}

export function useChatThreadScroll(
  options: UseChatThreadScrollOptions
): ChatThreadScrollController {
  const {
    messageCount,
    virtualizer = null,
    entryForceBottom = true,
    layoutCommittedEventName,
    messagesReady = false,
    prependInFlight = false,
    entryActive = true,
    ...engineConfig
  } = options;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ChatThreadScrollEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createChatThreadScrollEngine(engineConfig);
  }
  const engine = engineRef.current;

  const ctx = useCallback(
    () => buildContext(viewportRef.current, messageCount, virtualizer),
    [messageCount, virtualizer]
  );

  const tryCompleteEntry = useCallback(() => {
    engine.tryCompleteEntry(ctx());
  }, [engine, ctx]);

  const notifyLayoutCommitted = useCallback(() => {
    engine.notifyLayoutCommitted();
    tryCompleteEntry();
    if (engine.isSettled()) {
      engine.notifyLayoutResize(ctx());
    }
  }, [engine, ctx, tryCompleteEntry]);

  const notifyUserScroll = useCallback(() => {
    engine.notifyUserScroll(ctx());
  }, [engine, ctx]);

  const scrollToBottomExplicit = useCallback(() => {
    engine.scrollToBottomExplicit(ctx());
  }, [engine, ctx]);

  const notifyPrependComplete = useCallback(
    (input: NotifyPrependCompleteInput) => {
      engine.notifyPrependComplete(ctx(), input);
    },
    [engine, ctx]
  );

  const notifyEntry = useCallback(
    (input?: NotifyEntryInput) => {
      engine.notifyEntry(input);
      engine.notifyMessagesReady(messagesReady);
      if (messagesReady) tryCompleteEntry();
    },
    [engine, messagesReady, tryCompleteEntry]
  );

  useEffect(() => {
    engine.notifyPrependInFlight(prependInFlight);
  }, [engine, prependInFlight]);

  useEffect(() => {
    engine.notifyMessagesReady(messagesReady);
    if (messagesReady) tryCompleteEntry();
  }, [engine, messagesReady, tryCompleteEntry]);

  useEffect(() => {
    if (!entryActive) return;
    engine.notifyEntry({ forceBottom: entryForceBottom });
    engine.notifyMessagesReady(messagesReady);
    /* composer 없는 simple thread — layout commit 없이도 terminal 가능 */
    engine.notifyLayoutCommitted();
    tryCompleteEntry();
  }, [entryActive, entryForceBottom, engine, messagesReady, tryCompleteEntry]);

  useEffect(() => {
    if (engine.getPhase() !== "settled") return;
    engine.notifyAppend(ctx());
  }, [engine, ctx, messageCount]);

  useEffect(() => {
    if (!layoutCommittedEventName || typeof window === "undefined") return;
    const onLayout = () => notifyLayoutCommitted();
    window.addEventListener(layoutCommittedEventName, onLayout);
    return () => window.removeEventListener(layoutCommittedEventName, onLayout);
  }, [layoutCommittedEventName, notifyLayoutCommitted]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (engine.getPhase() === "entryPendingLayout") {
        tryCompleteEntry();
        return;
      }
      if (engine.isSettled()) {
        engine.notifyLayoutResize(ctx());
      }
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [engine, ctx, tryCompleteEntry]);

  return useMemo(
    () => ({
      viewportRef,
      notifyUserScroll,
      notifyLayoutCommitted,
      scrollToBottomExplicit,
      notifyPrependComplete,
      notifyEntry,
      engine,
    }),
    [
      notifyUserScroll,
      notifyLayoutCommitted,
      scrollToBottomExplicit,
      notifyPrependComplete,
      notifyEntry,
      engine,
    ]
  );
}
