// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PostImageGrid } from "@/components/community/post-detail/PostImageGrid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const url = (i: number) => `https://p.supabase.co/storage/v1/object/public/post-images/u1/community/img${i}.webp`;

let host: HTMLDivElement | null = null;
function render(n: number, onOpen: (i: number) => void = () => {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<PostImageGrid urls={Array.from({ length: n }, (_, i) => url(i))} onOpen={onOpen} labelFor={(i) => `이미지 ${i + 1}`} />);
  });
  return { root, el: host };
}
afterEach(() => {
  host?.remove();
  host = null;
});

describe("PostImageGrid 렌더 (D1·D4 · 페이스북형)", () => {
  it("1장은 격자 없이 원본 비율 한 장 + 로드 전 자리(4:3)", () => {
    const { el } = render(1);
    expect(el.querySelector('[data-testid="post-image-grid"]')).toBeNull();
    const b = el.querySelector<HTMLButtonElement>('[data-testid="post-body-image"]')!;
    expect(b.style.aspectRatio).toBe("4 / 3");
    expect(b.querySelector("img")!.getAttribute("src")).toContain("img0.detail.webp");
  });
  it("3장: 위 넓은 칸(.detail) + 아래 정사각 2칸(.feed)", () => {
    const { el } = render(3);
    const cells = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="post-body-image"]')];
    expect(cells).toHaveLength(3);
    expect(cells[0]!.className).toContain("col-span-6");
    expect(cells[0]!.className).toContain("aspect-[2/1]");
    expect(cells[0]!.querySelector("img")!.getAttribute("src")).toContain("img0.detail.webp");
    expect(cells[1]!.className).toContain("aspect-square");
    expect(cells[1]!.querySelector("img")!.getAttribute("src")).toContain("img1.feed.webp");
    for (const c of cells) expect(c.querySelector("img")!.style.height).toBe("100%");
  });
  it("4장: 2×2", () => {
    const { el } = render(4);
    const cells = [...el.querySelectorAll('[data-testid="post-body-image"]')];
    expect(cells).toHaveLength(4);
    expect(cells.every((c) => c.className.includes("col-span-3") && c.className.includes("aspect-square"))).toBe(true);
  });
  it("8장: 5칸 + 마지막 칸 +3, 탭하면 해당 순번으로 뷰어", () => {
    const opened: number[] = [];
    const { el } = render(8, (i) => opened.push(i));
    const cells = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="post-body-image"]')];
    expect(cells).toHaveLength(5);
    expect(el.querySelector('[data-testid="post-image-grid-more"]')!.textContent).toBe("+3");
    expect(cells[4]!.contains(el.querySelector('[data-testid="post-image-grid-more"]'))).toBe(true);
    act(() => cells[4]!.click());
    act(() => cells[0]!.click());
    expect(opened).toEqual([4, 0]);
  });
  it("파생본 실패 → 원본 1회 재시도", () => {
    const { el } = render(2);
    const img = el.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("img0.feed.webp");
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(el.querySelector("img")!.getAttribute("src")).toBe(url(0));
  });
});
