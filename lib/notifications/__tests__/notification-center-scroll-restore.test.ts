/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyNotificationCenterScrollRestore,
  consumeNotificationCenterScrollRestore,
  markNotificationCenterScrollRestore,
} from "@/lib/notifications/notification-center-scroll-restore";

/** U6 — 앱 셸은 창이 아니라 `[data-main-hub-scroll-body]` 가 스크롤된다. */
function mountHubScrollBody(opts: { scrollHeight: number; clientHeight: number }): HTMLElement {
  const main = document.createElement("main");
  main.setAttribute("data-main-hub-scroll-body", "");
  main.style.overflowY = "auto";
  Object.defineProperty(main, "scrollHeight", { configurable: true, get: () => opts.scrollHeight });
  Object.defineProperty(main, "clientHeight", { configurable: true, get: () => opts.clientHeight });
  document.body.appendChild(main);
  return main;
}

describe("U6 notification center scroll restore", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("saves the hub scroll body position, not window.scrollY", () => {
    const main = mountHubScrollBody({ scrollHeight: 1343, clientHeight: 738 });
    main.scrollTop = 500;
    markNotificationCenterScrollRestore();
    expect(consumeNotificationCenterScrollRestore()).toBe(500);
    expect(consumeNotificationCenterScrollRestore()).toBeNull();
  });

  it("restores into the hub scroll body", () => {
    const main = mountHubScrollBody({ scrollHeight: 1343, clientHeight: 738 });
    const stop = applyNotificationCenterScrollRestore(500);
    expect(main.scrollTop).toBe(500);
    stop();
  });

  it("keeps retrying until the list is tall enough", () => {
    const heights = { scrollHeight: 800, clientHeight: 738 };
    const main = mountHubScrollBody(heights);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    applyNotificationCenterScrollRestore(500);
    expect(frames).toHaveLength(1);
    heights.scrollHeight = 1343;
    frames.shift()?.(0);
    expect(main.scrollTop).toBe(500);
    expect(frames).toHaveLength(0);
  });

  it("stops when the user starts scrolling", () => {
    const main = mountHubScrollBody({ scrollHeight: 800, clientHeight: 738 });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    applyNotificationCenterScrollRestore(500);
    main.dispatchEvent(new Event("touchstart"));
    main.scrollTop = 0;
    frames.shift()?.(0);
    expect(main.scrollTop).toBe(0);
  });
});
