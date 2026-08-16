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
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("CASE A — intent clear before RAF must not cancel armed RTL enter", () => {
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

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(raf.pendingCount).toBe(1);
    raf.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("CASE A legacy — cleanup cancel before flush drops enter (prior FAIL)", () => {
    const raf = createDeferredRafQueue();
    const host: PathnameSingleSurfaceEnterArmHost = { current: null };
    const onFrame = vi.fn();

    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/market",
      onFrame,
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

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
    armPathnameSingleSurfaceEnter(host, {
      pathKey: "/community-messenger",
      onFrame: vi.fn(),
      requestAnimationFrameImpl: raf.requestAnimationFrame,
      cancelAnimationFrameImpl: raf.cancelAnimationFrame,
    });

    expect(host.current?.rafId).toBe(firstRafId);
    raf.flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("CASE C — superseding pathname cancels stale arm", () => {
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

    raf.flush();
    expect(onB).not.toHaveBeenCalled();
    expect(onC).toHaveBeenCalledTimes(1);
  });

  it("CASE D — same route scroll_only", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/philife")).toBeNull();
    expect(shouldMainBottomNavRouteScrollOnly("/philife", "", "/philife")).toBe(true);
  });

  it("CASE E — reduced-motion / 440ms contract", () => {
    expect(MAIN_SHELL_ROUTE_TRANSITION_MS).toBe(440);
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
  });
});

describe("AppRouteTransition post-incident contract", () => {
  it("keeps RAF ownership; does not mount always-on main-domain transform track", () => {
    const src = readFileSync(
      join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"),
      "utf8"
    );
    expect(src).toContain("armPathnameSingleSurfaceEnter");
    expect(src).toContain("DO NOT return cancelAnimationFrame");
    expect(src).not.toContain("data-main-domain-previous");
    expect(src).not.toContain("shouldArmMainDomainTruePush");
    expect(src).not.toContain("data-main-domain-track-idle");
    expect(src).toMatch(/MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>\(\)/);
  });

  it("RTL axis + cross-group false preserved", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
    expect(isCrossMainShellRouteGroup("/philife", "/stores")).toBe(false);
  });
});
