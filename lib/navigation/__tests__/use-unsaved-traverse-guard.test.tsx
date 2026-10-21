/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { shouldBlockUnsavedTraverse, useUnsavedTraverseGuard } from "@/lib/navigation/use-unsaved-traverse-guard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (e: { navigationType?: string; cancelable?: boolean; preventDefault: () => void }) => void;

function installFakeNavigation() {
  const listeners = new Set<Listener>();
  const pushState = vi.spyOn(window.history, "pushState");
  (window as unknown as { navigation: unknown }).navigation = {
    addEventListener: (_t: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_t: string, fn: Listener) => listeners.delete(fn),
  };
  const fire = (navigationType: string, cancelable = true) => {
    const e = { navigationType, cancelable, preventDefault: vi.fn() };
    listeners.forEach((fn) => fn(e));
    return e;
  };
  return { listeners, fire, pushState };
}

afterEach(() => {
  delete (window as unknown as { navigation?: unknown }).navigation;
  vi.restoreAllMocks();
});

describe("BK-05 unsaved traverse guard", () => {
  it("pure rule: only cancelable traverse, not after release", () => {
    expect(shouldBlockUnsavedTraverse({ navigationType: "traverse", cancelable: true }, false)).toBe(true);
    expect(shouldBlockUnsavedTraverse({ navigationType: "traverse", cancelable: false }, false)).toBe(false);
    expect(shouldBlockUnsavedTraverse({ navigationType: "push", cancelable: true }, false)).toBe(false);
    expect(shouldBlockUnsavedTraverse({ navigationType: "replace", cancelable: true }, false)).toBe(false);
    expect(shouldBlockUnsavedTraverse({ navigationType: "traverse", cancelable: true }, true)).toBe(false);
  });

  it("dirty: browser back is cancelled and confirm opens, with no history entry added", async () => {
    const nav = installFakeNavigation();
    const onBlocked = vi.fn();
    const apis: { release: () => void }[] = [];
    function Probe({ dirty }: { dirty: boolean }) {
      const api = useUnsavedTraverseGuard(dirty, onBlocked);
      useEffect(() => {
        apis.push(api);
      });
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe dirty={false} />));
    expect(nav.listeners.size).toBe(0);

    await act(async () => root.render(<Probe dirty />));
    const e = nav.fire("traverse");
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(nav.pushState).not.toHaveBeenCalled();

    // router.push / replace pass through
    expect(nav.fire("push").preventDefault).not.toHaveBeenCalled();

    // after 「나가기」 the following back is not blocked
    apis[apis.length - 1]!.release();
    expect(nav.fire("traverse").preventDefault).not.toHaveBeenCalled();

    await act(async () => root.render(<Probe dirty={false} />));
    expect(nav.listeners.size).toBe(0);
    root.unmount();
  });

  it("no Navigation API: no-op (existing behaviour)", async () => {
    const root = createRoot(document.createElement("div"));
    function Probe() {
      useUnsavedTraverseGuard(true, () => {});
      return null;
    }
    await act(async () => root.render(<Probe />));
    root.unmount();
  });
});
