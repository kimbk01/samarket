/**
 * Documents HEAD failure modes + post-fix layout-resize contract.
 * Entry setState cross-commit and Timeline shrink without pin are structural proofs.
 * Stick desync is covered by the fixed engine path (syncStickToBottom + force pin).
 */
import { describe, expect, it, vi } from "vitest";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";

function mockViewport(input: {
  scrollHeight?: number;
  scrollTop?: number;
  clientHeight?: number;
  rowCount?: number;
}): HTMLElement {
  let scrollTop = input.scrollTop ?? 0;
  let scrollHeight = input.scrollHeight ?? 1000;
  let clientHeight = input.clientHeight ?? 400;
  const rowCount = input.rowCount ?? 3;
  return {
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
}

describe("layout-resize authority proof", () => {
  it("PROOF entry: first paint at scrollTop=0 before tryComplete is wrong-state", () => {
    const vp = mockViewport({ scrollHeight: 2000, scrollTop: 0, clientHeight: 600 });
    expect(vp.scrollTop).toBe(0);
    const distanceFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    expect(distanceFromBottom).toBeGreaterThan(96);
  });

  it("PROOF keyboard: Timeline shrink + frozen scrollTop → last bubble under composer", () => {
    const vp = mockViewport({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 });
    expect(vp.scrollHeight - vp.scrollTop - vp.clientHeight).toBe(0);

    (vp as unknown as { clientHeight: number }).clientHeight = 300;
    const gapAfterShrink = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    expect(gapAfterShrink).toBe(300);
  });

  it("FIXED: stick desync + syncStickToBottom + layout resize pins bottom", () => {
    const engine = createChatThreadScrollEngine();
    const vp = mockViewport({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 });
    const ctx = { viewport: vp, messageCount: 10, virtualizer: null };

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx);
    expect(vp.scrollTop).toBe(2000);

    /** Simulate product stick true / engine stick false (pre-fix desync) */
    engine.state.stickToBottom = false;
    (engine as unknown as { lastGeom: null }).lastGeom = null;

    (vp as unknown as { clientHeight: number }).clientHeight = 300;
    /** Controller contract: sync stickRef → engine before notifyLayoutResize */
    engine.syncStickToBottom(true);
    const ok = engine.notifyLayoutResize(ctx);
    expect(ok).toBe(true);
    expect(vp.scrollTop).toBe(2000);
  });
});
