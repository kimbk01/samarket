/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAppReadySnapshot,
  markBootMetricsShellReady,
  markBootMetricsReactMounted,
  getDibayBootMetrics,
} from "@/lib/startup/startup-metrics";

describe("startup metrics App Ready", () => {
  it("marks shellReady before requiring firstPaint", () => {
    markBootMetricsReactMounted();
    markBootMetricsShellReady();
    const m = getDibayBootMetrics();
    expect(m.reactMounted).not.toBeNull();
    expect(m.shellReady).not.toBeNull();
    expect(getAppReadySnapshot()).toBe(true);
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
