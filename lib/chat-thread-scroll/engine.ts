import { CHAT_THREAD_STICK_THRESHOLD_PX } from "@/lib/chat-thread-scroll/constants";
import {
  chatThreadDistanceFromBottom,
  isChatThreadNearBottomFromMetrics,
  readChatThreadNearBottom,
} from "@/lib/chat-thread-scroll/near-bottom";
import { restoreChatThreadPrependAnchor } from "@/lib/chat-thread-scroll/prepend-anchor";
import {
  cmResizeCycleNote,
  cmResizeCycleReadViewport,
} from "@/lib/chat-thread-scroll/resize-cycle-instrumentation";
import type {
  ChatThreadScrollEngineConfig,
  ChatThreadScrollPhase,
  ChatThreadScrollRestoreSnapshot,
  ChatThreadScrollViewportContext,
  ChatThreadVirtualizer,
} from "@/lib/chat-thread-scroll/types";

export type ChatThreadScrollEngineState = {
  phase: ChatThreadScrollPhase;
  stickToBottom: boolean;
  prependInFlight: boolean;
  layoutReady: boolean;
  messagesReady: boolean;
  forceBottomOnEntry: boolean;
  entryAttempts: number;
};

export type NotifyEntryInput = {
  forceBottom?: boolean;
  restoreSnapshot?: ChatThreadScrollRestoreSnapshot | null;
};

export type NotifyPrependCompleteInput = {
  prevScrollTop: number;
  prevScrollHeight: number;
  estimatedPrependPx?: number;
};

export class ChatThreadScrollEngine {
  private config: Required<Omit<ChatThreadScrollEngineConfig, "resolveEntryPaintReady">> & {
    resolveEntryPaintReady?: ChatThreadScrollEngineConfig["resolveEntryPaintReady"];
  };
  state: ChatThreadScrollEngineState = {
    phase: "idle",
    stickToBottom: true,
    prependInFlight: false,
    layoutReady: false,
    messagesReady: false,
    forceBottomOnEntry: true,
    entryAttempts: 0,
  };
  private restoreSnapshot: ChatThreadScrollRestoreSnapshot | null = null;
  private lastGeom: { sh: number; st: number; ch: number } | null = null;

  constructor(config: ChatThreadScrollEngineConfig = {}) {
    this.config = {
      stickThresholdPx: config.stickThresholdPx ?? CHAT_THREAD_STICK_THRESHOLD_PX,
      messageRowSelector: config.messageRowSelector ?? "[data-cm-timeline-message-row]",
      resolveEntryPaintReady: config.resolveEntryPaintReady,
    };
  }

  reset(): void {
    this.state = {
      phase: "idle",
      stickToBottom: true,
      prependInFlight: false,
      layoutReady: false,
      messagesReady: false,
      forceBottomOnEntry: true,
      entryAttempts: 0,
    };
    this.restoreSnapshot = null;
    this.lastGeom = null;
  }

  getPhase(): ChatThreadScrollPhase {
    return this.state.phase;
  }

  isSettled(): boolean {
    return this.state.phase === "settled";
  }

  notifyEntry(input: NotifyEntryInput = {}): void {
    this.state.forceBottomOnEntry = input.forceBottom !== false;
    this.restoreSnapshot = input.restoreSnapshot ?? null;
    this.state.layoutReady = false;
    this.state.messagesReady = false;
    this.state.entryAttempts = 0;
    this.state.phase = "entryPendingLayout";
    if (this.restoreSnapshot) {
      this.state.stickToBottom = this.restoreSnapshot.stickToBottom;
    } else if (this.state.forceBottomOnEntry) {
      this.state.stickToBottom = true;
    }
  }

  notifyMessagesReady(ready: boolean): void {
    this.state.messagesReady = ready;
  }

  notifyLayoutCommitted(): void {
    this.state.layoutReady = true;
  }

  notifyPrependInFlight(inFlight: boolean): void {
    this.state.prependInFlight = inFlight;
  }

  notifyUserScroll(ctx: ChatThreadScrollViewportContext): void {
    const metrics = readChatThreadNearBottom(ctx.viewport, this.config.stickThresholdPx);
    if (!metrics) return;
    this.state.stickToBottom = metrics.nearBottom;
    this.captureGeom(ctx.viewport);
  }

  scrollToBottomExplicit(ctx: ChatThreadScrollViewportContext): boolean {
    this.state.stickToBottom = true;
    return this.applyScrollToBottom(ctx, { force: true });
  }

  /** append tail — near bottom 일 때만 follow */
  notifyAppend(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.state.phase !== "settled" || this.state.prependInFlight) return false;
    if (!this.state.stickToBottom) return false;
    return this.applyScrollToBottom(ctx, { force: false });
  }

  notifyPrependComplete(
    ctx: ChatThreadScrollViewportContext,
    input: NotifyPrependCompleteInput
  ): boolean {
    const vp = ctx.viewport;
    if (!vp) return false;
    restoreChatThreadPrependAnchor({
      viewport: vp,
      virtualizer: ctx.virtualizer,
      prevScrollTop: input.prevScrollTop,
      prevScrollHeight: input.prevScrollHeight,
      estimatedPrependPx: input.estimatedPrependPx,
    });
    this.captureGeom(vp);
    this.state.stickToBottom = false;
    return true;
  }

  /**
   * layout/keyboard resize — settled + stick 일 때만 follow.
   * entryPendingLayout 중에는 no-op.
   *
   * "하단에 있었는가"는 `state.stickToBottom`(마지막 실제 user scroll 이벤트가
   * 갱신) 하나만 믿지 않는다 — 키보드 전환 중 브라우저가 쏘는 과도기적 scroll
   * 이벤트가 이 플래그를 잘못 뒤집어도, resize 시점의 진짜 판단은 resize
   * *직전* 에 안정적으로 캡처해 둔 geometry(`lastGeom`)로 다시 확인한다.
   * Telegram/Kakao 계약: 판단은 항상 "지금 이 순간의 실측값" 기준, 기억에
   * 의존하는 실행부는 없음.
   */
  notifyLayoutResize(ctx: ChatThreadScrollViewportContext): boolean {
    // CM_RESIZE_CYCLE_PROBE (read-only)
    cmResizeCycleNote("notifyLayoutResize_enter", {
      phase: this.state.phase,
      settled: this.state.phase === "settled",
      engineStickToBottom: this.state.stickToBottom,
      prependInFlight: this.state.prependInFlight,
      viewport: cmResizeCycleReadViewport(ctx.viewport),
    });
    if (this.state.phase === "entryPendingLayout") {
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("notifyLayoutResize_return", {
        path: "return",
        returnReason: "phase_entryPendingLayout_tryCompleteEntry",
        phase: this.state.phase,
        engineStickToBottom: this.state.stickToBottom,
      });
      return this.tryCompleteEntry(ctx);
    }
    if (this.state.phase !== "settled") {
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("notifyLayoutResize_return", {
        path: "return",
        returnReason: "phase_not_settled",
        phase: this.state.phase,
        engineStickToBottom: this.state.stickToBottom,
      });
      return false;
    }

    const vp = ctx.viewport;
    if (this.state.prependInFlight) {
      /** 과거 메시지 로딩 중엔 하단으로 끌어당기지 않는다 — 다만 geometry는 갱신해
       * prepend 종료 직후 다음 resize가 stale 값을 보지 않게 한다. */
      if (vp) this.captureGeom(vp);
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("notifyLayoutResize_return", {
        path: "return",
        returnReason: "prependInFlight",
        phase: this.state.phase,
        engineStickToBottom: this.state.stickToBottom,
        viewport: cmResizeCycleReadViewport(vp),
      });
      return false;
    }

    const wasNearBottom = this.lastGeom
      ? isChatThreadNearBottomFromMetrics(
          { scrollHeight: this.lastGeom.sh, scrollTop: this.lastGeom.st, clientHeight: this.lastGeom.ch },
          this.config.stickThresholdPx
        )
      : this.state.stickToBottom;

    if (!wasNearBottom) {
      this.state.stickToBottom = false;
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("notifyLayoutResize_path", {
        path: "preserveScrollDistance",
        wasNearBottom: false,
        engineStickToBottom: this.state.stickToBottom,
        viewportBefore: cmResizeCycleReadViewport(vp),
      });
      return this.preserveScrollDistance(ctx);
    }
    // CM_RESIZE_CYCLE_PROBE (read-only)
    cmResizeCycleNote("notifyLayoutResize_path", {
      path: "applyScrollToBottom",
      wasNearBottom: true,
      force: false,
      engineStickToBottom: this.state.stickToBottom,
      viewportBefore: cmResizeCycleReadViewport(vp),
    });
    const scrolled = this.applyScrollToBottom(ctx, { force: false });
    this.state.stickToBottom = true;
    // CM_RESIZE_CYCLE_PROBE (read-only)
    cmResizeCycleNote("notifyLayoutResize_applyScrollToBottom_result", {
      path: "applyScrollToBottom",
      result: scrolled,
      engineStickToBottom: this.state.stickToBottom,
      viewportAfter: cmResizeCycleReadViewport(vp),
    });
    return scrolled;
  }

  tryCompleteEntry(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.state.phase !== "entryPendingLayout") return false;
    if (!this.state.messagesReady) return false;
    if (!this.state.layoutReady) return false;
    if (!this.isPaintReady(ctx)) return false;

    if (this.restoreSnapshot && !this.restoreSnapshot.stickToBottom) {
      return this.applyRestoreSnapshot(ctx);
    }

    const scrolled = this.applyScrollToBottom(ctx, { force: this.state.forceBottomOnEntry });
    if (!scrolled) {
      this.state.entryAttempts += 1;
      return false;
    }
    this.state.phase = "settled";
    this.state.entryAttempts = 0;
    return true;
  }

  notifyMessagesChanged(
    ctx: ChatThreadScrollViewportContext,
    input:
      | { kind: "append" }
      | { kind: "prepend"; prevScrollTop: number; prevScrollHeight: number; estimatedPrependPx?: number }
  ): boolean {
    if (input.kind === "prepend") {
      return this.notifyPrependComplete(ctx, input);
    }
    return this.notifyAppend(ctx);
  }

  private applyRestoreSnapshot(ctx: ChatThreadScrollViewportContext): boolean {
    const vp = ctx.viewport;
    const snap = this.restoreSnapshot;
    if (!vp || !snap) return false;
    if (snap.stickToBottom) {
      const ok = this.applyScrollToBottom(ctx, { force: true });
      if (ok) this.state.phase = "settled";
      return ok;
    }
    vp.scrollTop = snap.scrollTop;
    this.state.stickToBottom = false;
    this.state.phase = "settled";
    this.captureGeom(vp);
    return true;
  }

  private isPaintReady(ctx: ChatThreadScrollViewportContext): boolean {
    const vp = ctx.viewport;
    if (!vp || vp.clientHeight <= 0) return false;
    if (ctx.messageCount <= 0) return true;

    if (this.config.resolveEntryPaintReady) {
      return this.config.resolveEntryPaintReady(ctx);
    }

    const selector = this.config.messageRowSelector;
    const rowCount = selector ? vp.querySelectorAll(selector).length : 0;
    const totalSize = ctx.virtualizer?.getTotalSize?.() ?? 0;
    if (rowCount > 0 || totalSize > 0) return true;
    if (!selector) return vp.scrollHeight > 0;
    return false;
  }

  private applyScrollToBottom(
    ctx: ChatThreadScrollViewportContext,
    opts: { force: boolean }
  ): boolean {
    const vp = ctx.viewport;
    if (!vp) {
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("applyScrollToBottom_return", {
        path: "return",
        returnReason: "no_viewport",
        force: opts.force,
        engineStickToBottom: this.state.stickToBottom,
      });
      return false;
    }
    if (!opts.force && !this.state.stickToBottom) {
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("applyScrollToBottom_return", {
        path: "return",
        returnReason: "blocked_by_stickToBottom_false",
        force: opts.force,
        engineStickToBottom: this.state.stickToBottom,
        viewport: cmResizeCycleReadViewport(vp),
      });
      return false;
    }

    const count = ctx.messageCount;
    const virtualizer = ctx.virtualizer;
    if (count > 0 && virtualizer?.scrollToIndex) {
      try {
        virtualizer.scrollToIndex(count - 1, { align: "end" });
      } catch {
        /* virtualizer not ready */
      }
    }
    const before = cmResizeCycleReadViewport(vp);
    vp.scrollTop = vp.scrollHeight;
    const after = cmResizeCycleReadViewport(vp);
    // CM_RESIZE_CYCLE_PROBE (read-only)
    cmResizeCycleNote("applyScrollToBottom_write", {
      path: "applyScrollToBottom",
      force: opts.force,
      engineStickToBottom: true,
      viewportBefore: before,
      viewportAfter: after,
    });
    this.state.stickToBottom = true;
    this.captureGeom(vp);
    return vp.scrollHeight > 0 || count === 0;
  }

  private preserveScrollDistance(ctx: ChatThreadScrollViewportContext): boolean {
    const vp = ctx.viewport;
    const prev = this.lastGeom;
    if (!vp || !prev) {
      // CM_RESIZE_CYCLE_PROBE (read-only)
      cmResizeCycleNote("preserveScrollDistance_return", {
        path: "return",
        returnReason: !vp ? "no_viewport" : "no_lastGeom",
        engineStickToBottom: this.state.stickToBottom,
        viewport: cmResizeCycleReadViewport(vp),
      });
      return false;
    }
    const sh = vp.scrollHeight;
    const ch = vp.clientHeight;
    const maxScroll = Math.max(0, sh - ch);
    const distFromBottom = Math.max(0, prev.sh - prev.st - prev.ch);
    const before = cmResizeCycleReadViewport(vp);
    vp.scrollTop = Math.max(0, Math.min(maxScroll, maxScroll - distFromBottom));
    const after = cmResizeCycleReadViewport(vp);
    // CM_RESIZE_CYCLE_PROBE (read-only)
    cmResizeCycleNote("preserveScrollDistance_write", {
      path: "preserveScrollDistance",
      distFromBottom,
      engineStickToBottom: this.state.stickToBottom,
      viewportBefore: before,
      viewportAfter: after,
    });
    this.captureGeom(vp);
    return true;
  }

  private captureGeom(viewport: HTMLElement | null): void {
    if (!viewport) return;
    this.lastGeom = {
      sh: viewport.scrollHeight,
      st: viewport.scrollTop,
      ch: viewport.clientHeight,
    };
  }

  /** @internal test helper */
  readStickToBottom(): boolean {
    return this.state.stickToBottom;
  }

  /** @internal test helper */
  syncStickFromViewport(ctx: ChatThreadScrollViewportContext): void {
    const metrics = readChatThreadNearBottom(ctx.viewport, this.config.stickThresholdPx);
    if (metrics) this.state.stickToBottom = metrics.nearBottom;
  }
}

export function createChatThreadScrollEngine(
  config?: ChatThreadScrollEngineConfig
): ChatThreadScrollEngine {
  return new ChatThreadScrollEngine(config);
}

/** Exported for tests — distance helper alias */
export { isChatThreadNearBottomFromMetrics, chatThreadDistanceFromBottom };
