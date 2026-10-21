/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { __resetFormKeyboardViewportStoreForTests } from "@/lib/ui/use-form-keyboard-viewport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setVv(height: number, innerHeight = height, offsetTop = 0) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height, width: 400, offsetTop, addEventListener() {}, removeEventListener() {} },
  });
}

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
    await new Promise((r) => setTimeout(r, 80));
  });
  return root;
}

const stage = () => document.querySelector<HTMLElement>(".dibay-overlay-root--sheet")!;
const panel = () => document.querySelector<HTMLElement>(".dibay-overlay-sheet")!;

afterEach(() => {
  __resetFormKeyboardViewportStoreForTests();
  document.body.innerHTML = "";
});

describe("DibayBottomSheet keyboard band (Owner 조건 3)", () => {
  it("keyboard closed — geometry unchanged (device-bottom safe padding, no inline stage band)", async () => {
    setVv(800);
    const root = await render(
      <DibayBottomSheet open onClose={() => {}} anchor="device-bottom">
        <input />
      </DibayBottomSheet>
    );
    expect(stage().style.top).toBe("");
    expect(panel().style.paddingBottom).toBe("max(1rem, var(--safe-bottom))");
    expect(panel().className).toContain("max-h-[min(82dvh,560px)]");
    root.unmount();
  });

  it("keyboard closed — contentPaddingBottomPx consumers keep their padding", async () => {
    setVv(800);
    const root = await render(
      <DibayBottomSheet open onClose={() => {}} contentPaddingBottomPx={34}>
        <input />
      </DibayBottomSheet>
    );
    expect(panel().style.paddingBottom).toBe("34px");
    root.unmount();
  });

  it("keyboard open (iOS overlay) — stage = visible band, no keyboard px / safe added on top", async () => {
    setVv(480, 800, 0);
    const root = await render(
      <DibayBottomSheet open onClose={() => {}} contentPaddingBottomPx={320}>
        <input data-testid="kb-input" />
      </DibayBottomSheet>
    );
    await act(async () => {
      document.querySelector<HTMLInputElement>("[data-testid='kb-input']")!.focus();
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(stage().style.top).toBe("0px");
    expect(stage().style.height).toBe("480px");
    expect(stage().style.bottom).toBe("auto");
    expect(panel().style.paddingBottom).toBe("0px");
    expect(panel().style.maxHeight).toBe("480px");
    root.unmount();
  });
});
