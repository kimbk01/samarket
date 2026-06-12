import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logAdminApiCall,
  logAdminMutation,
  logAdminRouteEnter,
  resetAdminApiCallCountsForDev,
} from "@/lib/admin/admin-perf-logger";

describe("admin-perf-logger", () => {
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    infoSpy.mockClear();
    warnSpy.mockClear();
    resetAdminApiCallCountsForDev();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("logs route enter in development", () => {
    logAdminRouteEnter("/admin/users", 100);
    expect(infoSpy).toHaveBeenCalled();
    const first = infoSpy.mock.calls[0]?.[0];
    expect(String(first)).toContain("[admin-perf]");
    expect(String(first)).toContain("route enter time");
  });

  it("logs api call count and duplicate detection", () => {
    logAdminApiCall("admin:test");
    logAdminApiCall("admin:test", { duplicate: true });
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("duplicate request detected");
  });

  it("logs mutation phases", () => {
    logAdminMutation("save", "start");
    logAdminMutation("save", "success");
    logAdminMutation("save", "fail");
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
