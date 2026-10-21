/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  __resetFormKeyboardViewportStoreForTests,
  useFormKeyboardViewport,
} from "@/lib/ui/use-form-keyboard-viewport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Touch device (otherwise the adapter classifies a resize-only viewport as desktop "none").
Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });

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
  useEffect(() => {
    seen[id] = keyboardOpen;
  }, [id, keyboardOpen]);
  return null;
}

afterEach(() => {
  __resetFormKeyboardViewportStoreForTests();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.style.removeProperty("--safe-area-inset-bottom");
  vvListeners = 0;
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.innerHTML = "";
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
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
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

async function settle() {
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 60));
  });
}

async function mountProbe() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Probe id="p" />));
  await settle();
  return root;
}

function focusInput(): HTMLInputElement {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  return input;
}

describe("Android resize keyboard — rotation (A) / non-keyboard resize (B)", () => {
  it("focus alone never reports open (focus ≠ keyboard shown)", async () => {
    setVv(400, 800);
    const root = await mountProbe();
    focusInput();
    await settle();
    expect(seen.p).toBe(false);
    root.unmount();
  });

  it("A: keyboard open across portrait → landscape stays open, then closes and re-measures", async () => {
    setVv(400, 800);
    const root = await mountProbe();
    const input = focusInput();
    setVv(400, 500); // IME up (Android resize)
    await settle();
    expect(seen.p).toBe(true);
    setVv(800, 150); // rotate with the IME still up
    await settle();
    expect(seen.p).toBe(true);
    setVv(800, 400); // IME closes in landscape
    await settle();
    expect(seen.p).toBe(false);
    setVv(800, 180); // re-open in landscape — measured baseline, detected
    await settle();
    expect(seen.p).toBe(true);
    input.blur();
    setVv(800, 400);
    await settle();
    expect(seen.p).toBe(false);
    root.unmount();
  });

  it("A: rotation that closed the IME is not left pending", async () => {
    setVv(400, 800);
    const root = await mountProbe();
    focusInput();
    setVv(400, 500);
    await settle();
    expect(seen.p).toBe(true);
    setVv(800, 400); // rotated; IME dismissed by the rotation, focus kept
    await settle();
    expect(seen.p).toBe(false);
    root.unmount();
  });

  it("A: rotating back to a seen width reuses its measured closed height", async () => {
    setVv(400, 800); // portrait closed 800 measured
    const root = await mountProbe();
    setVv(800, 400); // landscape closed 400 measured
    await settle();
    focusInput();
    setVv(800, 180); // IME up in landscape
    await settle();
    expect(seen.p).toBe(true);
    setVv(400, 500); // rotate back with the IME up → exact portrait baseline 800, still open
    await settle();
    expect(seen.p).toBe(true);
    setVv(400, 800); // IME closes
    await settle();
    expect(seen.p).toBe(false);
    root.unmount();
  });

  it("B: height-only shrink without an input focused is not 'open' and does not stick", async () => {
    setVv(400, 800);
    const root = await mountProbe();
    setVv(400, 600); // split-screen / multi-window resize — no keyboard
    await settle();
    expect(seen.p).toBe(false);
    focusInput();
    await settle();
    expect(seen.p).toBe(false); // baseline re-measured to 600 — not stale 800
    setVv(400, 350); // real IME in the smaller window
    await settle();
    expect(seen.p).toBe(true);
    root.unmount();
  });
});

describe("Android native IME evidence (Capacitor SystemBars --safe-area-inset-bottom, read-only)", () => {
  function asAndroidApp() {
    (window as unknown as { Capacitor: unknown }).Capacitor = { getPlatform: () => "android" };
  }

  it("focused + non-keyboard shrink: inset > 0 proves IME hidden → closed, baseline re-measured", async () => {
    asAndroidApp();
    setVv(400, 800);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "48px");
    const root = await mountProbe();
    focusInput();
    setVv(400, 600); // split-screen resize while an input is focused — no IME
    await settle();
    expect(seen.p).toBe(false);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px"); // IME shows
    setVv(400, 330);
    await settle();
    expect(seen.p).toBe(true); // re-measured baseline 600 → real IME detected
    root.unmount();
  });

  it("inset 0 is no proof (IME up / side nav) — falls back to focus + shrink", async () => {
    asAndroidApp();
    setVv(400, 800);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px");
    const root = await mountProbe();
    focusInput();
    setVv(400, 500);
    await settle();
    expect(seen.p).toBe(true);
    root.unmount();
  });

  it("A: an estimated baseline after rotation is dropped as soon as the IME is proven hidden", async () => {
    asAndroidApp();
    setVv(400, 800);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px");
    const root = await mountProbe();
    focusInput();
    setVv(400, 500);
    await settle();
    expect(seen.p).toBe(true);
    setVv(800, 150); // rotated with IME up; estimate in play
    await settle();
    expect(seen.p).toBe(true);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "24px"); // IME hidden
    await settle();
    expect(seen.p).toBe(false);
    root.unmount();
  });
});

