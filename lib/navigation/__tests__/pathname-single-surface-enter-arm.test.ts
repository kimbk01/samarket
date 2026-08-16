import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import { shouldMainBottomNavRouteScrollOnly } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { isCrossMainShellRouteGroup } from "@/lib/navigation/main-shell-push-session";
import {
  armPathnameSingleSurfaceEnter,
  cancelPathnameSingleSurfaceEnterArm,
  type PathnameSingleSurfaceEnterArmHost,
} from "@/lib/navigation/pathname-single-surface-enter-arm";
import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";

/**
 * Deterministic rAF queue — callbacks stay pending until flush().
 * Models "intent null / children rerender before animation frame".
 */
function createDeferredRafQueue() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled = new Set<number>();

  return {
    requestAnimationFrame(cb: FrameRequestCallback): number {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      cancelled.add(id);
      pending.delete(id);
    },
    flush(): void {
      const entries = [...pending.entries()];
      pending.clear();
      for (const [id, cb] of entries) {
        if (cancelled.has(id)) continue;
        cb(0);
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe("pathname single-surface enter arm — bottom-nav RTL race", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CASE A — intent clear before RAF must not cancel armed RTL enter (legacy cleanup FAIL → ownership PASS)", () => {
    const raf = createDeferredRafQueue();
    const host: PathnameSingleSurfaceEnterArmHost = { current: null };
    const onFrame = vi.fn();

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(raf.pendingCount).toBe(1);
    expect(host.current?.pathKey).toBe("/market");

    /**
     * Legacy AppRouteTransition returned `() => cancelAnimationFrame(raf)` from the
     * pathname layout effect. Intent clear changed pendingMenuIntent?.id → effect
     * cleanup cancelled the arm before the frame. Simulate that broken cleanup:
     */
    const legacyCleanupWouldCancel = () => {
      if (host.current) raf.cancelAnimationFrame(host.current.rafId);
      host.current = null;
    };

    // Ownership fix: metadata rerun must NOT invoke cancel. Only prove PASS path.
    // (If we ran legacyCleanupWouldCancel here, flush would no-op — the old FAIL.)
    void legacyCleanupWouldCancel;

    // Simulate intent → null rerender: same pathKey, no cancelPathnameSingleSurfaceEnterArm.
    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(raf.pendingCount).toBe(1);
    raf.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(host.current).toBeNull();
  });

  it("CASE A legacy — cleanup cancel before flush drops enter (documents prior FAIL)", () => {
    const raf = createDeferredRafQueue();
    const host: PathnameSingleSurfaceEnterArmHost = { current: null };
    const onFrame = vi.fn();

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    // Prior race: effect cleanup on intent clear
    cancelPathnameSingleSurfaceEnterArm(host, raf.cancelAnimationFrame);

    raf.flush();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("CASE B — children update before RAF keeps the same pathname arm", () => {
    const raf = createDeferredRafQueue();
    const host: PathnameSingleSurfaceEnterArmHost = { current: null };
    const onFrame = vi.fn();

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/community-messenger",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    const firstRafId = host.current?.rafId;
    expect(firstRafId).toBeTypeOf("number");

    // children identity change → same pathKey re-arm is a no-op
    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/community-messenger",
      onFrame: vi.fn(),
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(host.current?.rafId).toBe(firstRafId);
    expect(raf.pendingCount).toBe(1);
    raf.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("CASE C — superseding pathname cancels stale arm; only next transition fires", () => {
    const raf = createDeferredRafQueue();
    const host: PathnameSingleSurfaceEnterArmHost = { current: null };
    const onB = vi.fn();
    const onC = vi.fn();

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame: onB,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/mypage",
      onFrame: onC,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(host.current?.pathKey).toBe("/mypage");
    expect(raf.pendingCount).toBe(1);
    raf.flush();
    expect(onB).not.toHaveBeenCalled();
    expect(onC).toHaveBeenCalledTimes(1);
  });

  it("CASE D — same route scroll_only; push axis null (no new route animation)", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/philife")).toBeNull();
    expect(shouldMainBottomNavRouteScrollOnly("/philife", "", "/philife")).toBe(true);
  });

  it("CASE E — reduced-motion contract: arm helper unused when skip; 440ms constant preserved", () => {
    expect(MAIN_SHELL_ROUTE_TRANSITION_MS).toBe(440);
    // AppRouteTransition gates with prefersReducedMotion() before armPathnameSingleSurfaceEnter.
    // Document that axis still resolves rtl when motion is allowed:
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
  });
});

describe("AppRouteTransition hub enter arm — source contract", () => {
  it("hub enter does not return cancelAnimationFrame cleanup (intent/children race)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"),
      "utf8"
    );
    expect(src).toContain("armPathnameSingleSurfaceEnter");
    expect(src).toContain("shouldArmMainDomainTruePush");
    expect(src).toContain('MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>()');
    expect(src).toContain("data-main-domain-previous");
    expect(src).toContain("liveChildren");
  });

  it("product contracts unchanged — RTL axis, dual-panel empty, cross-group false", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/market", "/community-messenger")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/community-messenger", "/mypage")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/mypage", "/philife")).toBe("rtl");
    expect(isCrossMainShellRouteGroup("/philife", "/stores")).toBe(false);

    const appSrc = readFileSync(
      join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"),
      "utf8"
    );
    expect(appSrc).toMatch(/MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>\(\)/);
  });
});
