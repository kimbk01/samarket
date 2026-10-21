/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MESSENGER_HUB_LIST_SCROLL_SAVE_THROTTLE_MS,
  messengerHubListScrollStorageKey,
  readMessengerHubListScrollTop,
  useMessengerHubListScrollMemory,
  writeMessengerHubListScrollTop,
} from "@/lib/community-messenger/home/messenger-hub-list-scroll-memory";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom 은 레이아웃이 없어 scrollHeight/clientHeight 를 직접 지정 */
let contentHeight = 5000;
function fakeLayout(el: HTMLElement) {
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => contentHeight });
}

const frames: Array<() => void> = [];
const raf = {
  request: (cb: () => void) => {
    frames.push(cb);
    return frames.length;
  },
  cancel: () => undefined,
};
function runFrames(n: number) {
  for (let i = 0; i < n && frames.length; i += 1) frames.shift()!();
}

let scrollEl: HTMLDivElement | null = null;
function Probe({ section }: { section: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMessengerHubListScrollMemory(ref, "default", section, raf);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        scrollEl = el;
        if (el) fakeLayout(el);
      }}
    />
  );
}

describe("X-1 hub list scroll memory", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    sessionStorage.clear();
    frames.length = 0;
    contentHeight = 5000;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("saves scrollTop per section (throttled) and restores on remount", () => {
    act(() => root.render(<Probe section="chats" />));
    scrollEl!.scrollTop = 1234;
    scrollEl!.dispatchEvent(new Event("scroll"));
    expect(readMessengerHubListScrollTop(messengerHubListScrollStorageKey("default", "chats"))).toBeNull();
    vi.advanceTimersByTime(MESSENGER_HUB_LIST_SCROLL_SAVE_THROTTLE_MS);
    expect(readMessengerHubListScrollTop(messengerHubListScrollStorageKey("default", "chats"))).toBe(1234);

    // 방으로 이동(언마운트) → 복귀(재마운트)
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Probe section="chats" />));
    expect(scrollEl!.scrollTop).toBe(1234);
  });

  it("flushes the pending value on unmount", () => {
    act(() => root.render(<Probe section="friends" />));
    scrollEl!.scrollTop = 777;
    scrollEl!.dispatchEvent(new Event("scroll"));
    act(() => root.unmount());
    root = createRoot(container);
    expect(readMessengerHubListScrollTop(messengerHubListScrollStorageKey("default", "friends"))).toBe(777);
  });

  it("waits for content to grow before restoring; user touch cancels", () => {
    writeMessengerHubListScrollTop(messengerHubListScrollStorageKey("default", "chats"), 3000);
    contentHeight = 1000;
    act(() => root.render(<Probe section="chats" />));
    expect(scrollEl!.scrollTop).toBe(0);
    contentHeight = 5000;
    runFrames(1);
    expect(scrollEl!.scrollTop).toBe(3000);

    act(() => root.unmount());
    root = createRoot(container);
    contentHeight = 1000;
    act(() => root.render(<Probe section="chats" />));
    scrollEl!.dispatchEvent(new Event("pointerdown"));
    contentHeight = 5000;
    runFrames(5);
    expect(scrollEl!.scrollTop).toBe(0);
  });

  it("does not restore on tab (section) change within the same mount", () => {
    writeMessengerHubListScrollTop(messengerHubListScrollStorageKey("default", "friends"), 2000);
    act(() => root.render(<Probe section="chats" />));
    expect(scrollEl!.scrollTop).toBe(0);
    act(() => root.render(<Probe section="friends" />));
    expect(scrollEl!.scrollTop).toBe(0);
  });

  it("storage failures never throw", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const spy2 = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readMessengerHubListScrollTop("k")).toBeNull();
    expect(() => writeMessengerHubListScrollTop("k", 10)).not.toThrow();
    spy.mockRestore();
    spy2.mockRestore();
  });
});
