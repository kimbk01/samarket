import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CM_PERF_REGRESSION_COMPOSER_VISIBLE_MS,
  CM_PERF_REGRESSION_SHELL_VISIBLE_MS,
  resetCmMessengerPerfRegressionGuardForTests,
  warnCmPerfRegressionComposerVisibleMs,
  warnCmPerfRegressionShellVisibleMs,
} from "@/lib/community-messenger/room/cm-messenger-perf-regression-guard";

describe("cm-messenger-perf-regression-guard", () => {
  beforeEach(() => {
    resetCmMessengerPerfRegressionGuardForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns when shell_visible_ms exceeds threshold", () => {
    warnCmPerfRegressionShellVisibleMs("room-a", CM_PERF_REGRESSION_SHELL_VISIBLE_MS + 1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const body = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.kind).toBe("shell_visible_slow");
  });

  it("does not warn when composer_visible_ms is within threshold", () => {
    warnCmPerfRegressionComposerVisibleMs("room-a", CM_PERF_REGRESSION_COMPOSER_VISIBLE_MS);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("dedupes repeated warnings for the same room", () => {
    warnCmPerfRegressionShellVisibleMs("room-a", 500);
    warnCmPerfRegressionShellVisibleMs("room-a", 600);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
