import { CHAT_THREAD_STICK_THRESHOLD_PX } from "@/lib/chat-thread-scroll/constants";
import {
  chatThreadDistanceFromBottom,
  isChatThreadNearBottomFromMetrics,
  readChatThreadNearBottom,
} from "@/lib/chat-thread-scroll/near-bottom";
import { restoreChatThreadPrependAnchor } from "@/lib/chat-thread-scroll/prepend-anchor";
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

type VisibleAnchor = { id: string; offset: number };

/**
 * Single scroll authority for all chat threads.
 * Entry: tryCompleteEntry once → settled.
 * Layout/keyboard resize: stick → pin bottom (force); else preserve visible message anchor.
 * DO NOT add platform-specific scroll writers outside this engine.
 */
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
  private visibleAnchor: VisibleAnchor | null = null;

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
    this.visibleAnchor = null;
  }

  getPhase(): ChatThreadScrollPhase {
    return this.state.phase;
  }

  isSettled(): boolean {
    return this.state.phase === "settled";
  }

  /** Product stick (ref) → engine stick — layout resize must not desync */
  syncStickToBottom(stick: boolean): void {
    this.state.stickToBottom = stick;
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
   * Unified layout/keyboard/chrome resize transaction.
   * - entryPendingLayout → tryCompleteEntry only
   * - settled + stick → pin bottom (force) so Timeline shrink keeps last bubble above Composer
   * - settled + !stick → preserve visible message id+offset
   */
  notifyLayoutResize(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.state.phase === "entryPendingLayout") {
      return this.tryCompleteEntry(ctx);
    }
    if (this.state.phase !== "settled" || this.state.prependInFlight) return false;
    if (!this.state.stickToBottom) {
      return this.preserveVisibleAnchor(ctx);
    }
    return this.applyScrollToBottom(ctx, { force: true });
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
    if (!vp) return false;
    if (!opts.force && !this.state.stickToBottom) return false;

    const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight);
    const geometryUnchanged =
      this.lastGeom != null &&
      this.lastGeom.sh === vp.scrollHeight &&
      this.lastGeom.ch === vp.clientHeight;
    if (geometryUnchanged && Math.abs(vp.scrollTop - maxScroll) <= 1) {
      this.captureGeom(vp);
      return true;
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
    vp.scrollTop = vp.scrollHeight;
    this.state.stickToBottom = true;
    this.captureGeom(vp);
    return vp.scrollHeight > 0 || count === 0;
  }

  private preserveVisibleAnchor(ctx: ChatThreadScrollViewportContext): boolean {
    const vp = ctx.viewport;
    const anchor = this.visibleAnchor;
    if (!vp || !anchor) return this.preserveScrollDistance(ctx);
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(anchor.id)
        : anchor.id.replace(/["\\]/g, "\\$&");
    const row = vp.querySelector<HTMLElement>(
      `${this.config.messageRowSelector}[data-cm-message-id="${escaped}"]`
    );
    if (!row || typeof row.getBoundingClientRect !== "function") {
      return this.preserveScrollDistance(ctx);
    }
    const currentOffset =
      row.getBoundingClientRect().top - vp.getBoundingClientRect().top;
    const delta = currentOffset - anchor.offset;
    if (Math.abs(delta) > 0.5) {
      vp.scrollTop = vp.scrollTop + delta;
    }
    this.captureGeom(vp);
    return true;
  }

  private preserveScrollDistance(ctx: ChatThreadScrollViewportContext): boolean {
    const vp = ctx.viewport;
    const prev = this.lastGeom;
    if (!vp || !prev) return false;
    const sh = vp.scrollHeight;
    const ch = vp.clientHeight;
    const maxScroll = Math.max(0, sh - ch);
    const distFromBottom = Math.max(0, prev.sh - prev.st - prev.ch);
    vp.scrollTop = Math.max(0, Math.min(maxScroll, maxScroll - distFromBottom));
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
    this.captureVisibleAnchor(viewport);
  }

  private captureVisibleAnchor(viewport: HTMLElement): void {
    if (
      typeof viewport.getBoundingClientRect !== "function" ||
      typeof viewport.querySelectorAll !== "function"
    ) {
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const rows = viewport.querySelectorAll<HTMLElement>(this.config.messageRowSelector);
    for (const row of rows) {
      if (!row || typeof row.getBoundingClientRect !== "function") continue;
      const id = row.getAttribute?.("data-cm-message-id")?.trim();
      if (!id) continue;
      const rect = row.getBoundingClientRect();
      if (rect.height <= 0 || rect.bottom <= viewportRect.top || rect.top >= viewportRect.bottom) {
        continue;
      }
      this.visibleAnchor = { id, offset: rect.top - viewportRect.top };
      return;
    }
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

  /** @internal test helper */
  readVisibleAnchor(): VisibleAnchor | null {
    return this.visibleAnchor;
  }
}

export function createChatThreadScrollEngine(
  config?: ChatThreadScrollEngineConfig
): ChatThreadScrollEngine {
  return new ChatThreadScrollEngine(config);
}

/** Exported for tests — distance helper alias */
export { isChatThreadNearBottomFromMetrics, chatThreadDistanceFromBottom };
