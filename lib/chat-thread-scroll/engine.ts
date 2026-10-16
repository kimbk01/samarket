import {
  CHAT_THREAD_ANIMATED_SCROLL_MS,
  CHAT_THREAD_STICK_THRESHOLD_PX,
} from "@/lib/chat-thread-scroll/constants";
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
  /** 진행 중인 부드러운 이동(↓ 버튼 등) — 하나만. */
  private animation: { raf: number | null; cleanup: () => void } | null = null;

  constructor(config: ChatThreadScrollEngineConfig = {}) {
    this.config = {
      stickThresholdPx: config.stickThresholdPx ?? CHAT_THREAD_STICK_THRESHOLD_PX,
      messageRowSelector: config.messageRowSelector ?? "[data-cm-timeline-message-row]",
      resolveEntryPaintReady: config.resolveEntryPaintReady,
    };
  }

  reset(): void {
    this.cancelAnimation();
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
    this.cancelAnimation();
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
    /** 프로그램 이동 중 발생한 scroll 이벤트로 stick 을 뒤집지 않는다(사용자 개입은 touch/wheel 로 애니메이션을 먼저 취소). */
    if (this.animation) return;
    const metrics = readChatThreadNearBottom(ctx.viewport, this.config.stickThresholdPx);
    if (!metrics) return;
    this.state.stickToBottom = metrics.nearBottom;
    this.captureGeom(ctx.viewport);
  }

  scrollToBottomExplicit(ctx: ChatThreadScrollViewportContext): boolean {
    this.cancelAnimation();
    this.state.stickToBottom = true;
    return this.applyScrollToBottom(ctx, { force: true });
  }

  scrollToIndexExplicit(
    ctx: ChatThreadScrollViewportContext,
    index: number,
    align: "start" | "center" | "end" | "auto" = "center"
  ): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= ctx.messageCount) return false;
    if (!ctx.virtualizer?.scrollToIndex) return false;
    this.cancelAnimation();
    this.state.stickToBottom = false;
    ctx.virtualizer.scrollToIndex(index, { align });
    this.captureGeom(ctx.viewport);
    return true;
  }

  /** append tail — near bottom 일 때만 follow */
  notifyAppend(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.state.phase !== "settled" || this.state.prependInFlight) return false;
    /** 하단으로 이동 중이면 애니메이션이 매 프레임 새 하단을 다시 읽어 따라간다. */
    if (this.animation) return this.state.stickToBottom;
    if (!this.state.stickToBottom) return false;
    return this.applyScrollToBottom(ctx, { force: false });
  }

  notifyPrependComplete(
    ctx: ChatThreadScrollViewportContext,
    input: NotifyPrependCompleteInput
  ): boolean {
    const vp = ctx.viewport;
    if (!vp) return false;
    this.cancelAnimation();
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
   * layout/keyboard resize — **policy is not re-decided here**.
   * Enter / user scroll / own-send set `stickToBottom`; resize only preserves that
   * relationship (bottom follow vs distance preserve). Do not flip stick from
   * transient lastGeom / keyboard scroll noise.
   */
  notifyLayoutResize(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.state.phase === "entryPendingLayout") {
      return this.tryCompleteEntry(ctx);
    }
    if (this.state.phase !== "settled") return false;
    /** 부드러운 이동 중 — 목표를 매 프레임 다시 읽으므로 여기서 즉시 쓰지 않는다(애니메이션이 끊기며 순간이동되지 않게). */
    if (this.animation) return true;

    const vp = ctx.viewport;
    if (this.state.prependInFlight) {
      /** 과거 메시지 로딩 중엔 하단으로 끌어당기지 않는다 — 다만 geometry는 갱신해
       * prepend 종료 직후 다음 resize가 stale 값을 보지 않게 한다. */
      if (vp) this.captureGeom(vp);
      return false;
    }

    if (!this.state.stickToBottom) {
      return this.preserveScrollDistance(ctx);
    }
    return this.applyScrollToBottom(ctx, { force: false });
  }

  /**
   * Single keyboard/chrome correction writer.
   * Does not re-decide stick / entry policy. May complete a pending entry pin
   * when paint becomes ready, or force one end/preserve write if stick is already set.
   */
  correctLayoutPreserve(ctx: ChatThreadScrollViewportContext): boolean {
    if (this.animation && this.state.phase === "settled") return true;
    if (this.state.prependInFlight) {
      if (ctx.viewport) this.captureGeom(ctx.viewport);
      return false;
    }

    if (this.state.phase === "entryPendingLayout") {
      if (this.tryCompleteEntry(ctx)) return true;
    }

    if (this.state.stickToBottom) {
      const ok = this.applyScrollToBottom(ctx, { force: true });
      if (ok) {
        this.state.phase = "settled";
        this.restoreSnapshot = null;
      }
      return ok;
    }

    const preserved = this.preserveScrollDistance(ctx);
    if (preserved && this.state.phase === "entryPendingLayout") {
      this.state.phase = "settled";
    }
    return preserved;
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
  }

  /** 실제 DOM 위치 기준 즉시 이동(메시지 찾기·답장 원문 등) — stick 해제. */
  scrollToElementExplicit(
    ctx: ChatThreadScrollViewportContext,
    element: HTMLElement,
    align: "start" | "center" | "end" | "auto"
  ): boolean {
    const vp = ctx.viewport;
    if (!vp) return false;
    this.cancelAnimation();
    const vpRect = vp.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const rowTop = rect.top - vpRect.top + vp.scrollTop;
    const top =
      align === "center"
        ? rowTop - vp.clientHeight / 2 + rect.height / 2
        : align === "end"
          ? rowTop - vp.clientHeight + rect.height
          : rowTop;
    vp.scrollTop = Math.max(0, top);
    this.state.stickToBottom = false;
    this.captureGeom(vp);
    return true;
  }

  isAnimating(): boolean {
    return this.animation != null;
  }

  cancelAnimation(): void {
    const a = this.animation;
    if (!a) return;
    this.animation = null;
    if (a.raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(a.raf);
    a.cleanup();
  }

  /**
   * ↓ 버튼(최신으로) — 텔레그램·카톡처럼 부드럽게 맨 아래까지. 매 프레임 하단을 다시 읽어
   * 사진 로드 등으로 높이가 바뀌어도 정확히 맨 아래에 도착한다. 끝나면 stick 유지.
   */
  animateScrollToBottom(
    ctx: ChatThreadScrollViewportContext,
    opts?: { onDone?: () => void }
  ): boolean {
    return this.animateScrollTo(ctx, (vp) => vp.scrollHeight - vp.clientHeight, {
      stickToBottom: true,
      onDone: opts?.onDone,
    });
  }

  /**
   * 특정 메시지(첫 안 읽음 등)로 부드럽게 이동 — 목표는 매 프레임 실제 DOM 위치로 다시 계산한다(추정 높이 미사용).
   */
  animateScrollToElement(
    ctx: ChatThreadScrollViewportContext,
    element: HTMLElement,
    align: "start" | "center" | "end" | "auto",
    opts?: { onDone?: () => void; topInsetPx?: number }
  ): boolean {
    const inset = Math.max(0, opts?.topInsetPx ?? 0);
    let lastTarget: number | null = null;
    return this.animateScrollTo(
      ctx,
      (vp) => {
        if (!element.isConnected) return lastTarget ?? vp.scrollTop;
        const vpRect = vp.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const rowTop = rect.top - vpRect.top + vp.scrollTop;
        const target =
          align === "center"
            ? rowTop - vp.clientHeight / 2 + rect.height / 2
            : align === "end"
              ? rowTop - vp.clientHeight + rect.height
              : rowTop - inset;
        lastTarget = target;
        return target;
      },
      { stickToBottom: false, onDone: opts?.onDone }
    );
  }

  private animateScrollTo(
    ctx: ChatThreadScrollViewportContext,
    resolveTarget: (vp: HTMLElement) => number,
    opts: { stickToBottom: boolean; onDone?: () => void }
  ): boolean {
    const vp = ctx.viewport;
    if (!vp) return false;
    this.cancelAnimation();
    this.state.stickToBottom = opts.stickToBottom;
    const clampTop = (v: number) => Math.max(0, Math.min(Math.max(0, vp.scrollHeight - vp.clientHeight), v));

    if (typeof requestAnimationFrame !== "function") {
      vp.scrollTop = clampTop(resolveTarget(vp));
      this.captureGeom(vp);
      opts.onDone?.();
      return true;
    }

    /**
     * iOS WKWebView: 관성 스크롤이 남아 있으면 scrollTop 쓰기가 무시·덮어써진다 —
     * 한 프레임 overflow 를 막아 관성을 멈춘 뒤 이동한다.
     */
    const prevOverflowY = vp.style.overflowY;
    vp.style.overflowY = "hidden";
    let overflowRestored = false;
    const restoreOverflow = () => {
      if (overflowRestored) return;
      overflowRestored = true;
      vp.style.overflowY = prevOverflowY;
    };
    /** 사용자가 손대면 즉시 멈추고 사용자에게 넘긴다(이후 stick 은 일반 scroll 판정). */
    const onUserTakeover = () => this.cancelAnimation();
    vp.addEventListener("touchstart", onUserTakeover, { passive: true });
    vp.addEventListener("wheel", onUserTakeover, { passive: true });
    vp.addEventListener("mousedown", onUserTakeover, { passive: true });
    const cleanup = () => {
      restoreOverflow();
      vp.removeEventListener("touchstart", onUserTakeover);
      vp.removeEventListener("wheel", onUserTakeover);
      vp.removeEventListener("mousedown", onUserTakeover);
    };

    const durationMs = CHAT_THREAD_ANIMATED_SCROLL_MS;
    let startTop: number | null = null;
    let t0 = 0;
    let settleFrames = 0;
    const anim: { raf: number | null; cleanup: () => void } = { raf: null, cleanup };
    const step = (now: number) => {
      if (this.animation !== anim) return;
      restoreOverflow();
      const target = clampTop(resolveTarget(vp));
      if (startTop == null) {
        let from = vp.scrollTop;
        const ch = vp.clientHeight;
        /** 멀리 떨어져 있으면 목표 한 화면 앞까지 먼저 건너뛴 뒤 부드럽게(텔레그램 방식). */
        if (Math.abs(target - from) > ch * 1.5) {
          from = target > from ? target - ch : target + ch;
          vp.scrollTop = from;
        }
        startTop = from;
        t0 = now;
      }
      const p = Math.min(1, (now - t0) / durationMs);
      if (p < 1) {
        const eased = 1 - Math.pow(1 - p, 3);
        vp.scrollTop = startTop + (target - startTop) * eased;
        anim.raf = requestAnimationFrame(step);
        return;
      }
      vp.scrollTop = target;
      /** 도착 후 2프레임 동안 목표 재확인 — 늦은 레이아웃 변화까지 맞춘다. */
      settleFrames += 1;
      if (settleFrames < 3) {
        anim.raf = requestAnimationFrame(step);
        return;
      }
      this.animation = null;
      cleanup();
      this.captureGeom(vp);
      opts.onDone?.();
    };
    this.animation = anim;
    anim.raf = requestAnimationFrame(step);
    return true;
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
