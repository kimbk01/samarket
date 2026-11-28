// @vitest-environment jsdom
/**
 * 라운지 댓글 실기 결함 2 (2026-11-28 Samsung 13:47 PHT) — 새 댓글로 이동할 때 문서가 아니라 본문 스크롤 영역만 움직인다. 동작 시험.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { findNearestScrollableAncestor, scrollElementIntoCenter } from "@/lib/ui/scroll-element-into-center";

function sized(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scrollElementIntoCenter", () => {
  it("가장 가까운 스크롤 영역만 움직이고 문서는 그대로 둔다", () => {
    const outer = document.createElement("div");
    outer.style.overflowY = "auto";
    sized(outer, 5000, 800);
    const inner = document.createElement("div");
    inner.style.overflowY = "visible";
    const target = document.createElement("article");
    inner.appendChild(target);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    outer.scrollTop = 100;
    vi.spyOn(outer, "getBoundingClientRect").mockReturnValue({ top: 50, height: 800 } as DOMRect);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 1050, height: 100 } as DOMRect);
    const containerScroll = vi.fn();
    (outer as unknown as { scrollTo: unknown }).scrollTo = containerScroll;
    const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const nativeIntoView = vi.fn();
    (target as unknown as { scrollIntoView: unknown }).scrollIntoView = nativeIntoView;

    expect(findNearestScrollableAncestor(target)).toBe(outer);
    scrollElementIntoCenter(target);

    // offset = 1050 - 50 + 100 = 1100 → 가운데 = 1100 - 400 + 50 = 750
    expect(containerScroll).toHaveBeenCalledWith({ top: 750, behavior: "smooth" });
    expect(windowScroll).not.toHaveBeenCalled();
    expect(nativeIntoView).not.toHaveBeenCalled();
  });

  it("넘치지 않는 overflow:auto 조상은 건너뛴다", () => {
    const shell = document.createElement("div");
    shell.style.overflowY = "auto";
    sized(shell, 3000, 700);
    const fits = document.createElement("div");
    fits.style.overflowY = "auto";
    sized(fits, 200, 200);
    const target = document.createElement("div");
    fits.appendChild(target);
    shell.appendChild(fits);
    document.body.appendChild(shell);
    expect(findNearestScrollableAncestor(target)).toBe(shell);
  });
});
