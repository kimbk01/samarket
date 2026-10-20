// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectorHeaderBar } from "@/components/layout/sector-header/SectorHeaderBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

beforeEach(() => {
  /** jsdom 은 레이아웃이 없어 슬롯 폭을 data 속성으로 흉내낸다 */
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      const child = this.firstElementChild as HTMLElement | null;
      return Number(child?.dataset.w ?? 0);
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
});

function bar(): HTMLElement {
  return host!.querySelector(".sector-header-bar") as HTMLElement;
}

describe("SectorHeaderBar symmetric side columns", () => {
  it("back(48) + two right icons(96) → both columns 96px", () => {
    act(() =>
      root!.render(
        <SectorHeaderBar
          left={<span data-w="48" />}
          center={<span>제목</span>}
          right={<span data-w="96" />}
        />
      )
    );
    expect(bar().style.getPropertyValue("--sector-header-side")).toBe("96px");
    expect(bar().dataset.sectorHeaderAlign).toBe("center");
  });

  it("single icon each side → CSS default (no inline var)", () => {
    act(() =>
      root!.render(
        <SectorHeaderBar left={<span data-w="48" />} center={<span>제목</span>} right={<span data-w="48" />} />
      )
    );
    expect(bar().style.getPropertyValue("--sector-header-side")).toBe("");
  });

  it("left-aligned hub title keeps hub geometry and no side var", () => {
    act(() =>
      root!.render(<SectorHeaderBar centerAlign="left" center={<span>내정보</span>} right={<span data-w="144" />} />)
    );
    expect(bar().className).toContain("sector-header-bar--left-title");
    expect(bar().style.getPropertyValue("--sector-header-side")).toBe("");
  });
});
