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
  /**
   * D-05 (재감사 3차): 커뮤니티·거래는 띠가 본문 `<main>` 밖 전역 헤더(`AppStickyHeader` · `[data-app-sticky-header]`)에 그려지고
   * 제스처는 스크롤 루트에만 붙는다(bindStickyHeader 없음) — 헤더 CTA 탭은 손가락 감지에 닿지 않는다.
   * 그 화면의 실패 원인은 「접힘」이 아니라 유지 시간(D-05 · 3초 연장)이다.
   */
  it("커뮤니티·거래 구조: 헤더(감지 밖)의 CTA 탭은 제스처에 닿지 않는다", async () => {
    await mount("SUCCESS");
    const header = document.createElement("div");
    header.setAttribute("data-app-sticky-header", "");
    document.body.appendChild(header);
    const cta = document.createElement("button");
    cta.setAttribute("data-ptr-reveal-cta", "");
    header.appendChild(cta);
    const plainHeaderTap = document.createElement("div");
    header.appendChild(plainHeaderTap);

    touch(cta, "touchstart");
    touch(cta, "touchend");
    touch(plainHeaderTap, "touchstart");
    touch(plainHeaderTap, "touchend");

    expect(scrollRoot.contains(cta)).toBe(false);
    expect(patch).not.toHaveBeenCalled();
    expect(snapshot.pullPx).toBe(64);
    header.remove();
  });
});
