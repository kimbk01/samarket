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
  const clientHeight = input.clientHeight ?? 400;
  const rowCount = input.rowCount ?? 1;
  const maxScroll = () => Math.max(0, scrollHeight - clientHeight);
  const el = {
    get scrollHeight() {
      return scrollHeight;
    },
    set scrollHeight(v: number) {
      scrollHeight = v;
      if (scrollTop > maxScroll()) scrollTop = maxScroll();
    },
    clientHeight,
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      scrollTop = Math.max(0, Math.min(maxScroll(), v));
    },
    querySelectorAll: vi.fn(() => Array.from({ length: rowCount })),
  } as unknown as HTMLElement;
  return el;
}

function setScrollHeight(el: HTMLElement, height: number): void {
  (el as unknown as { scrollHeight: number }).scrollHeight = height;
}

describe("ChatThreadScrollEngine", () => {
  it("entry → terminal maxScroll 1회 (layout + messages ready)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 800, clientHeight: 400, rowCount: 3 });
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    const ok = engine.tryCompleteEntry(ctx);

    expect(ok).toBe(true);
    expect(engine.getPhase()).toBe("settled");
    expect(vp.scrollTop).toBe(400);
  });

  it("entry refuses settle when pin misses maxScroll", () => {
    const engine = createChatThreadScrollEngine();
    const scrollHeight = 800;
    const clientHeight = 400;
    let scrollTop = 0;
    const vp = {
      get scrollHeight() {
        return scrollHeight;
      },
      get clientHeight() {
        return clientHeight;
      },
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(v: number) {
        /** 고의로 max 미달 clamp — measure 미완료 시뮬레이션 */
        const max = Math.max(0, scrollHeight - clientHeight);
        scrollTop = Math.max(0, Math.min(max - 40, v));
      },
      querySelectorAll: vi.fn(() => [{}, {}, {}]),
    } as unknown as HTMLElement;
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    expect(engine.tryCompleteEntry(ctx)).toBe(false);
    expect(engine.getPhase()).toBe("entryPendingLayout");

    /** measure 완료 후 정상 clamp */
    Object.defineProperty(vp, "scrollTop", {
      configurable: true,
      get() {
        return scrollTop;
      },
      set(v: number) {
        const max = Math.max(0, scrollHeight - clientHeight);
        scrollTop = Math.max(0, Math.min(max, v));
      },
    });
    expect(engine.tryCompleteEntry(ctx)).toBe(true);
    expect(scrollTop).toBe(400);
    expect(engine.getPhase()).toBe("settled");
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
    expect(nearVp.scrollTop).toBe(1100);

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

  it("layout change after settled + near-bottom geom → force follow even if stick flipped", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 600, scrollTop: 200, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 4, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    /** keyboard 과도기: stick false 여도 lastGeom near-bottom 이면 follow */
    engine.state.stickToBottom = false;
    vp.clientHeight;
    setScrollHeight(vp, 700);
    /** lastGeom still from entry at max (200→ after entry max was 200 for 600-400) */
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    expect(vp.scrollTop).toBe(300);
    expect(engine.readStickToBottom()).toBe(true);
  });

  it("keyboard shrink: near-bottom lastGeom → scrollTop rises with smaller clientHeight", () => {
    const engine = createChatThreadScrollEngine();
    let clientHeight = 854;
    let scrollTop = 0;
    const scrollHeight = 1817;
    const vp = {
      get scrollHeight() {
        return scrollHeight;
      },
      get clientHeight() {
        return clientHeight;
      },
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(v: number) {
        const max = Math.max(0, scrollHeight - clientHeight);
        scrollTop = Math.max(0, Math.min(max, v));
      },
      querySelectorAll: vi.fn(() => [{}, {}, {}]),
    } as unknown as HTMLElement;
    const ctx = { viewport: vp, messageCount: 20, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    expect(engine.tryCompleteEntry(ctx)).toBe(true);
    expect(scrollTop).toBe(1817 - 854);

    /** 과도기 scroll 이벤트가 stick 을 꺼도 */
    engine.state.stickToBottom = false;
    clientHeight = 549;
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    expect(scrollTop).toBe(1817 - 549);
  });

  it("prepend in flight blocks layout follow", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 600, scrollTop: 200, clientHeight: 400 });
    const ctx = { viewport: vp, messageCount: 4, virtualizer: null };

    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    expect(vp.scrollTop).toBe(200);
    engine.state.stickToBottom = true;
    engine.notifyPrependInFlight(true);

    setScrollHeight(vp, 900);
    const blocked = engine.notifyLayoutResize(ctx);
    expect(blocked).toBe(false);
    expect(vp.scrollTop).toBe(200);
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
    expect(vp.scrollTop).toBe(400);
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
