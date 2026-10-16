import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";

type FakeViewport = HTMLElement & {
  _setScrollHeight: (h: number) => void;
  _fire: (type: string) => void;
};

function fakeViewport(init: { scrollHeight: number; clientHeight: number; scrollTop: number }): FakeViewport {
  let scrollTop = init.scrollTop;
  let scrollHeight = init.scrollHeight;
  const listeners = new Map<string, Set<() => void>>();
  const style = { overflowY: "" };
  const el = {
    style,
    get scrollHeight() {
      return scrollHeight;
    },
    clientHeight: init.clientHeight,
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      scrollTop = Math.max(0, Math.min(scrollHeight - init.clientHeight, v));
    },
    querySelectorAll: () => [1],
    addEventListener: (t: string, fn: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
    getBoundingClientRect: () => ({ top: 0, bottom: init.clientHeight, height: init.clientHeight }),
    _setScrollHeight: (h: number) => {
      scrollHeight = h;
    },
    _fire: (t: string) => listeners.get(t)?.forEach((fn) => fn()),
  };
  return el as unknown as FakeViewport;
}

let now = 0;
let queue: Array<{ id: number; cb: (t: number) => void }> = [];
let nextId = 1;
function runFrames(n: number, msPerFrame = 16): void {
  for (let i = 0; i < n; i += 1) {
    now += msPerFrame;
    const batch = queue;
    queue = [];
    for (const f of batch) f.cb(now);
  }
}

beforeEach(() => {
  now = 0;
  queue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatThreadScrollEngine animated scroll (↓ FAB)", () => {
  it("moves smoothly (intermediate positions) and lands exactly on the bottom, keeping stick", () => {
    const engine = createChatThreadScrollEngine();
    const vp = fakeViewport({ scrollHeight: 2000, clientHeight: 500, scrollTop: 1000 });
    const ctx = { viewport: vp, messageCount: 10, virtualizer: null };
    const done = vi.fn();
    expect(engine.animateScrollToBottom(ctx, { onDone: done })).toBe(true);
    expect(engine.isAnimating()).toBe(true);
    // 첫 프레임 전: 관성 정지용 overflow 잠금
    expect(vp.style.overflowY).toBe("hidden");
    runFrames(3);
    expect(vp.style.overflowY).toBe("");
    expect(vp.scrollTop).toBeGreaterThan(1000);
    expect(vp.scrollTop).toBeLessThan(1500);
    runFrames(40);
    expect(vp.scrollTop).toBe(1500);
    expect(engine.isAnimating()).toBe(false);
    expect(engine.readStickToBottom()).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("retargets when content grows mid-animation (late image load)", () => {
    const engine = createChatThreadScrollEngine();
    const vp = fakeViewport({ scrollHeight: 2000, clientHeight: 500, scrollTop: 1000 });
    engine.animateScrollToBottom({ viewport: vp, messageCount: 10, virtualizer: null });
    runFrames(5);
    vp._setScrollHeight(2600);
    runFrames(40);
    expect(vp.scrollTop).toBe(2100);
  });

  it("far away: jumps to one screen above the target first, then animates", () => {
    const engine = createChatThreadScrollEngine();
    const vp = fakeViewport({ scrollHeight: 20000, clientHeight: 500, scrollTop: 0 });
    engine.animateScrollToBottom({ viewport: vp, messageCount: 100, virtualizer: null });
    runFrames(1);
    expect(vp.scrollTop).toBeGreaterThanOrEqual(19000);
    runFrames(40);
    expect(vp.scrollTop).toBe(19500);
  });

  it("user touch cancels the animation and scroll events during animation do not flip stick", () => {
    const engine = createChatThreadScrollEngine();
    const vp = fakeViewport({ scrollHeight: 2000, clientHeight: 500, scrollTop: 1000 });
    const ctx = { viewport: vp, messageCount: 10, virtualizer: null };
    engine.animateScrollToBottom(ctx);
    runFrames(2);
    engine.notifyUserScroll(ctx); // programmatic scroll event — ignored
    expect(engine.readStickToBottom()).toBe(true);
    vp._fire("touchstart");
    expect(engine.isAnimating()).toBe(false);
    const pos = vp.scrollTop;
    runFrames(10);
    expect(vp.scrollTop).toBe(pos);
  });
});
