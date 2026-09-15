/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAppReadySnapshot,
  isInitialDestinationVisualReady,
  markBootMetricsShellReady,
  markInitialDestinationVisualReady,
  markBootMetricsReactMounted,
  getDibayBootMetrics,
  whenAppShellReady,
  isAppShellReady,
} from "@/lib/startup/startup-metrics";

describe("startup metrics App Ready", () => {
  it("keeps shellReady as a metric and dismisses only after initial destination visual readiness", () => {
    markBootMetricsReactMounted();
    markBootMetricsShellReady();
    const m = getDibayBootMetrics();
    expect(m.reactMounted).not.toBeNull();
    expect(m.shellReady).not.toBeNull();
    expect(m.initialDestinationVisualReady).toBeNull();
    expect(getAppReadySnapshot()).toBe(false);
    expect(isAppShellReady()).toBe(true);

    markInitialDestinationVisualReady();
    const ready = getDibayBootMetrics();
    expect(ready.initialDestinationVisualReady).not.toBeNull();
    expect(getAppReadySnapshot()).toBe(true);
    expect(isAppShellReady()).toBe(true);
    expect(isInitialDestinationVisualReady()).toBe(true);
  });

  it("whenAppShellReady runs after shellReady", async () => {
    const order: string[] = [];
    const cancel = whenAppShellReady(() => {
      order.push("run");
    });
    if (!isAppShellReady()) {
      expect(order).toEqual([]);
      markBootMetricsShellReady();
      expect(order).toEqual(["run"]);
    } else {
      await new Promise((r) => setTimeout(r, 0));
      expect(order).toEqual(["run"]);
    }
    cancel();
  });

  it("does not use shellReady as the native FE dismiss authority", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/startup/startup-metrics.ts"), "utf8");
    const shell = readFileSync(resolve(process.cwd(), "components/layout/ConditionalAppShell.tsx"), "utf8");
    const shellReadyBody = src.match(/export function markBootMetricsShellReady\(\): void \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(shellReadyBody).not.toContain("tryDismissNativeSplash");
    expect(src).toContain("export function markInitialDestinationVisualReady");
    expect(src).not.toMatch(/setTimeout\([^)]*initialDestinationVisualReady/);
    expect(shell).toContain("requestAnimationFrame(() =>");
    expect(shell).not.toMatch(/setTimeout\([^)]*markInitialDestinationVisualReady/);
  });

  it("keeps community initial loading as destination UI, not blank document background", () => {
    const loading = readFileSync(
      resolve(process.cwd(), "app/(main)/philife/loading.tsx"),
      "utf8"
    );
    const feed = readFileSync(
      resolve(process.cwd(), "components/community/CommunityFeed.tsx"),
      "utf8"
    );

    expect(loading).toContain("MainFeedRouteLoading");
    expect(feed).toContain("loading && postsForList.length === 0 && !err ? (");
    expect(feed).toContain("<CommunityFeedSkeleton rows={5} />");
  });
});

describe("MainActivity timed splash removal", () => {
  it("does not keep SPLASH_MAX_KEEP_MS timer contract", () => {
    const src = readFileSync(
      resolve(process.cwd(), "android/app/src/main/java/com/dibay/app/MainActivity.java"),
      "utf8"
    );
    expect(src).not.toMatch(/SPLASH_MAX_KEEP_MS/);
    expect(src).toMatch(/webSplashDismissRequested/);
  });
});
