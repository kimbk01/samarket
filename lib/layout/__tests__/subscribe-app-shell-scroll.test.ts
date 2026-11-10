// @vitest-environment jsdom
/**
 * F 단계 계약 (Owner 「정해진 설계안 순서대로」 2026-11-10):
 * 앱 셸 스크롤 구독은 전역 DOM 관찰(MutationObserver·ResizeObserver)과 스크롤 루트 판정 계산(getComputedStyle)을 하지 않는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyAppShellScrollRootsChanged } from "@/lib/layout/app-shell-scroll-root-registry";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { getStoreDetailAppScrollRootCached, invalidateStoreDetailScrollRootCache } from "@/lib/ui/store-detail-scroll-root";

afterEach(() => {
  document.body.innerHTML = "";
  invalidateStoreDetailScrollRootCache();
  vi.restoreAllMocks();
});

function mountShell(): { outer: HTMLElement; hub: HTMLElement } {
  const outer = document.createElement("main");
  const hub = document.createElement("main");
  hub.setAttribute("data-main-hub-scroll-body", "");
  outer.appendChild(hub);
  document.body.appendChild(outer);
  return { outer, hub };
}

describe("subscribeAppShellScroll — F 단계", () => {
  it("허브 본문·셸 main·window 에 붙고, 실제 스크롤된 요소 이벤트를 받는다", () => {
    const { hub, outer } = mountShell();
    const onScroll = vi.fn();
    const unsub = subscribeAppShellScroll(onScroll);
    hub.dispatchEvent(new Event("scroll"));
    outer.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(onScroll).toHaveBeenCalledTimes(3);
    unsub();
    hub.dispatchEvent(new Event("scroll"));
    expect(onScroll).toHaveBeenCalledTimes(3);
  });

  it("전역 MutationObserver·ResizeObserver 를 만들지 않고 getComputedStyle 을 부르지 않는다", () => {
    mountShell();
    const mo = vi.spyOn(globalThis, "MutationObserver");
    const gcs = vi.spyOn(window, "getComputedStyle");
    const unsub = subscribeAppShellScroll(() => {});
    for (let i = 0; i < 50; i += 1) document.body.appendChild(document.createElement("div"));
    expect(mo).not.toHaveBeenCalled();
    expect(gcs).not.toHaveBeenCalled();
    unsub();
  });

  it("허브 본문이 새로 생기면(소유자 알림) 새 요소에도 붙고 onTargetsChanged 를 부른다", () => {
    const onScroll = vi.fn();
    const onTargetsChanged = vi.fn();
    const unsub = subscribeAppShellScroll(onScroll, { onTargetsChanged });
    const { hub } = mountShell();
    notifyAppShellScrollRootsChanged();
    expect(onTargetsChanged).toHaveBeenCalled();
    hub.dispatchEvent(new Event("scroll"));
    expect(onScroll).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("스크롤 이벤트가 난 요소가 캐시된 스크롤 루트가 된다(판정 계산 없이)", () => {
    const { hub } = mountShell();
    const unsub = subscribeAppShellScroll(() => {});
    hub.dispatchEvent(new Event("scroll"));
    const gcs = vi.spyOn(window, "getComputedStyle");
    expect(getStoreDetailAppScrollRootCached()).toBe(hub);
    expect(gcs).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("scroll"));
    expect(getStoreDetailAppScrollRootCached()).toBe(document.documentElement);
    unsub();
  });
});
