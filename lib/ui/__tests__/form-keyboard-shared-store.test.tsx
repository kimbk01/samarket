/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  __resetFormKeyboardViewportStoreForTests,
  useFormKeyboardViewport,
} from "@/lib/ui/use-form-keyboard-viewport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let vvListeners = 0;
function setVv(width: number, height: number, innerHeight = height) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      height,
      width,
      offsetTop: 0,
      addEventListener() {
        vvListeners += 1;
      },
      removeEventListener() {
        vvListeners -= 1;
      },
    },
  });
}

const seen: Record<string, boolean> = {};
function Probe({ id, enabled = true }: { id: string; enabled?: boolean }) {
  const { keyboardOpen } = useFormKeyboardViewport({ enabled });
  seen[id] = keyboardOpen;
  return null;
}

afterEach(() => {
  __resetFormKeyboardViewportStoreForTests();
  vvListeners = 0;
});

describe("Form keyboard shared store (Owner 조건 1 — 중복 측정·리스너 없음)", () => {
  it("N consumers share ONE set of visualViewport listeners; detached when none remain", async () => {
    setVv(400, 800);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <>
          <Probe id="a" />
          <Probe id="b" />
          <Probe id="c" />
        </>
      );
    });
    expect(vvListeners).toBe(2); // resize + scroll, once
    await act(async () => root.render(<Probe id="a" enabled={false} />));
    expect(vvListeners).toBe(0);
    expect(seen.a).toBe(false);
    root.unmount();
  });

  it("a consumer mounted while the keyboard is up shares the closed baseline (iOS overlay)", async () => {
    setVv(400, 800);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe id="root" />));
    // keyboard opens — vv shrinks under unchanged layout height (overlay)
    setVv(400, 480, 800);
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () =>
      root.render(
        <>
          <Probe id="root" />
          <Probe id="late" />
        </>
      )
    );
    expect(seen.root).toBe(true);
    expect(seen.late).toBe(true);
    root.unmount();
  });
});
