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
  /** CM 등 외부에서 viewport ref 를 공유할 때 */
  viewportRef?: RefObject<HTMLDivElement | null>;
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
    viewportRef: viewportRefOption,
    ...engineConfig
  } = options;

  const viewportRefInternal = useRef<HTMLDivElement | null>(null);
  const viewportRef = viewportRefOption ?? viewportRefInternal;
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

    const onResize = () => {
      if (engine.getPhase() === "entryPendingLayout") {
        tryCompleteEntry();
        return;
      }
      if (engine.isSettled()) {
        engine.notifyLayoutResize(ctx());
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(vp);
    /** viewport 박스만이 아니라 내부 시트 높이 변화(가상행 measure)도 pin/entry 재시도 대상 */
    const sheet = vp.firstElementChild;
    if (sheet) ro.observe(sheet);

    return () => ro.disconnect();
  }, [engine, ctx, tryCompleteEntry, messageCount]);

  /**
   * entry: virtualizer scrollToIndex 가 한 프레임 늦게 scrollTop 을 덮을 수 있음.
   * layout 커밋 후 1회 더 tryComplete — 무한 settle 루프 아님.
   */
  useEffect(() => {
    if (!entryActive || !messagesReady) return;
    if (typeof requestAnimationFrame !== "function") return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (engine.getPhase() === "entryPendingLayout") {
          tryCompleteEntry();
        } else if (engine.isSettled() && engine.readStickToBottom()) {
          engine.notifyLayoutResize(ctx());
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [entryActive, messagesReady, messageCount, engine, ctx, tryCompleteEntry]);

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
