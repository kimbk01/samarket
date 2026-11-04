// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";

/**
 * V-13 — 새로고침 결과 표시(SUCCESS/ERROR) 중 띠 광고 CTA 칩 탭.
 * 탭의 touchend 가 「당김 취소」로 처리되어 `pullPx:0` 을 쓰면 click 이 오기 전에 띠가 IDLE 로 접힌다.
 */

let scrollRoot: HTMLDivElement;
vi.mock("@/lib/layout/main-app-scroll-root", () => ({
  getMainAppScrollRootCached: () => scrollRoot,
  getMainAppScrollTop: () => 0,
  invalidateMainAppScrollRootCache: () => {},
}));
vi.mock("@/lib/layout/subscribe-app-shell-scroll", () => ({
  subscribeAppShellScroll: () => () => {},
}));

function touch(target: Element, type: "touchstart" | "touchend", y = 100): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: type === "touchstart" ? [{ clientX: 50, clientY: y }] : [] });
  target.dispatchEvent(ev);
}

describe("PTR gesture — reveal CTA tap during result hold (V-13)", () => {
  let host: HTMLDivElement;
  let root: Root;
  let snapshot: DibayPtrSnapshot;
  const patch = vi.fn((p: { pullPx?: number; refreshing?: boolean }) => {
    snapshot = { ...snapshot, pullPx: p.pullPx ?? snapshot.pullPx };
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    patch.mockClear();
    scrollRoot = document.createElement("div");
    document.body.appendChild(scrollRoot);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    scrollRoot.remove();
  });

  async function mount(phase: DibayPtrSnapshot["phase"]) {
    snapshot = { pullPx: 64, refreshing: false, phase, outcome: null };
    const { useDibayPtrGesture } = await import("@/lib/ui/ptr/use-dibay-ptr-gesture");
    const store = { getSnapshot: () => snapshot, patch };
    function Probe() {
      useDibayPtrGesture({ enabled: true, store, onRelease: () => {}, rootDatasetKey: "testPtr" });
      return null;
    }
    act(() => root.render(<Probe />));
  }

  it.each(["SUCCESS", "ERROR"] as const)("%s: CTA 칩 탭은 띠를 접지 않는다", async (phase) => {
    await mount(phase);
    const cta = document.createElement("button");
    cta.setAttribute("data-ptr-reveal-cta", "");
    scrollRoot.appendChild(cta);

    touch(cta, "touchstart");
    touch(cta, "touchend");

    expect(patch).not.toHaveBeenCalled();
    expect(snapshot.pullPx).toBe(64);
  });

  it("CTA 밖 탭은 기존대로 결과 표시를 접는다 (다른 표면 동작 불변)", async () => {
    await mount("SUCCESS");
    const other = document.createElement("div");
    scrollRoot.appendChild(other);

    touch(other, "touchstart");
    touch(other, "touchend");

    expect(patch).toHaveBeenCalledWith({ pullPx: 0 });
  });
});
