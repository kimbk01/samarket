import { describe, expect, it, vi } from "vitest";
import { CHAT_THREAD_STICK_THRESHOLD_PX } from "@/lib/chat-thread-scroll/constants";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";
import { isChatThreadNearBottomFromMetrics } from "@/lib/chat-thread-scroll/near-bottom";

function mockViewport(input: {
  scrollHeight?: number;
  scrollTop?: number;
  clientHeight?: number;
  rowCount?: number;
}): HTMLElement {
  let scrollTop = input.scrollTop ?? 0;
  let scrollHeight = input.scrollHeight ?? 1000;
  let clientHeight = input.clientHeight ?? 400;
  const rowCount = input.rowCount ?? 1;
  const el = {
    get scrollHeight() {
      return scrollHeight;
    },
    set scrollHeight(v: number) {
      scrollHeight = v;
    },
    get clientHeight() {
      return clientHeight;
    },
    set clientHeight(v: number) {
      clientHeight = v;
    },
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      scrollTop = v;
    },
    querySelectorAll: vi.fn(() => Array.from({ length: rowCount })),
    querySelector: vi.fn(() => null),
    getBoundingClientRect: vi.fn(() => ({
      top: 0,
      bottom: clientHeight,
      height: clientHeight,
      left: 0,
      right: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })),
  } as unknown as HTMLElement;
  return el;
}

function setScrollHeight(el: HTMLElement, height: number): void {
  (el as unknown as { scrollHeight: number }).scrollHeight = height;
}

describe("ChatThreadScrollEngine", () => {
  it("entry → terminal bottom 1회 (layout + messages ready)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 800, clientHeight: 400, rowCount: 3 });
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    const ok = engine.tryCompleteEntry(ctx);

    expect(ok).toBe(true);
    expect(engine.getPhase()).toBe("settled");
    expect(vp.scrollTop).toBe(800);
  });

  it("layout change before settled → no spurious scroll", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 800, scrollTop: 100, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 5, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    const resized = engine.notifyLayoutResize(ctx);
    expect(resized).toBe(false);
    expect(vp.scrollTop).toBe(100);
    expect(engine.getPhase()).toBe("entryPendingLayout");
  });

  it("append near bottom → follow / far → no follow", () => {
    const engine = createChatThreadScrollEngine();
    const nearVp = mockViewport({ scrollHeight: 1000, scrollTop: 920, clientHeight: 100 });
    const farVp = mockViewport({ scrollHeight: 1000, scrollTop: 0, clientHeight: 100 });
    const ctxNear = { viewport: nearVp, messageCount: 10, virtualizer: null };
    const ctxFar = { viewport: farVp, messageCount: 10, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctxNear);
    expect(engine.getPhase()).toBe("settled");

    nearVp.scrollTop = 920;
    engine.syncStickFromViewport(ctxNear);
    setScrollHeight(nearVp, 1200);
    const followed = engine.notifyAppend(ctxNear);
    expect(followed).toBe(true);
    expect(nearVp.scrollTop).toBe(1200);

    engine.notifyUserScroll(ctxFar);
    expect(engine.readStickToBottom()).toBe(false);
    setScrollHeight(farVp, 1400);
    const notFollowed = engine.notifyAppend(ctxFar);
    expect(notFollowed).toBe(false);
    expect(farVp.scrollTop).toBe(0);
  });

  it("prepend → anchor preserve (native)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 1000, scrollTop: 200, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 20, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);

    const prevTop = vp.scrollTop;
    const prevHeight = vp.scrollHeight;
    setScrollHeight(vp, 1400);
    engine.notifyPrependComplete(ctx, { prevScrollTop: prevTop, prevScrollHeight: prevHeight });
    expect(vp.scrollTop).toBe(prevTop + 400);
    expect(engine.readStickToBottom()).toBe(false);
  });

  it("prepend → anchor preserve (virtualizer scrollToOffset)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 800, scrollTop: 50, clientHeight: 400 });
    const scrollToOffset = vi.fn();
    const ctx = {
      viewport: vp,
      messageCount: 5,
      virtualizer: { scrollOffset: 50, scrollToOffset },
    };

    setScrollHeight(vp, 1100);
    engine.notifyPrependComplete(ctx, {
      prevScrollTop: 50,
      prevScrollHeight: 800,
      estimatedPrependPx: 300,
    });
    expect(scrollToOffset).toHaveBeenCalledWith(350, { align: "start" });
    expect(vp.scrollTop).toBe(350);
  });

  it("layout change after settled + stick → follow", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 600, scrollTop: 200, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 4, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    engine.state.stickToBottom = true;

    setScrollHeight(vp, 700);
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    expect(vp.scrollTop).toBe(700);
  });

  it("keyboard shrink while stick → force pin bottom (last bubble above composer)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 });
    const ctx = { viewport: vp, messageCount: 10, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    expect(vp.scrollTop).toBe(2000);

    /** Product stick desync then sync — layout resize must still pin */
    engine.state.stickToBottom = false;
    engine.syncStickToBottom(true);
    (vp as unknown as { clientHeight: number }).clientHeight = 300;
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    expect(vp.scrollTop).toBe(2000);
  });

  it("layout resize while !stick preserves scroll distance when no row anchor", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 2000, scrollTop: 400, clientHeight: 600 });
    const ctx = { viewport: vp, messageCount: 10, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    vp.scrollTop = 400;
    engine.notifyUserScroll(ctx);
    expect(engine.readStickToBottom()).toBe(false);

    (vp as unknown as { clientHeight: number }).clientHeight = 300;
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    /** distance-from-bottom preserved: was 2000-400-600=1000 → maxScroll=1700 → top=700 */
    expect(vp.scrollTop).toBe(700);
  });

  it("prepend in flight blocks layout follow", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 600, scrollTop: 200, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 4, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    expect(vp.scrollTop).toBe(600);
    engine.state.stickToBottom = true;
    engine.notifyPrependInFlight(true);

    setScrollHeight(vp, 900);
    const blocked = engine.notifyLayoutResize(ctx);
    expect(blocked).toBe(false);
    expect(vp.scrollTop).toBe(600);
  });

  it("custom resolveEntryPaintReady blocks entry until ready", () => {
    let ready = false;
    const engine = createChatThreadScrollEngine({
      messageRowSelector: "[data-cm-timeline-message-row]",
      resolveEntryPaintReady: () => ready,
    });
    const vp = mockViewport({ scrollHeight: 800, clientHeight: 400, rowCount: 3 });
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    expect(engine.tryCompleteEntry(ctx)).toBe(false);
    expect(engine.getPhase()).toBe("entryPendingLayout");

    ready = true;
    expect(engine.tryCompleteEntry(ctx)).toBe(true);
    expect(engine.getPhase()).toBe("settled");
    expect(vp.scrollTop).toBe(800);
  });

  it("stick threshold is 96px SSOT", () => {
    expect(CHAT_THREAD_STICK_THRESHOLD_PX).toBe(96);
    expect(
      isChatThreadNearBottomFromMetrics({ scrollHeight: 500, scrollTop: 404, clientHeight: 100 })
    ).toBe(true);
    expect(
      isChatThreadNearBottomFromMetrics({ scrollHeight: 500, scrollTop: 300, clientHeight: 100 })
    ).toBe(false);
  });
});
