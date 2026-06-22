import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCallEngineActiveRoute,
  replaceCallEngineRouteOnce,
} from "@/lib/community-messenger/call-engine/call-engine-route-gate";
import { resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";

describe("call-engine route gate", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
  });

  it("navigates once per callId", () => {
    const replace = vi.fn();
    const router = { replace };
    expect(replaceCallEngineRouteOnce(router, "c1", "/community-messenger/calls/c1?mode=active")).toBe(true);
    expect(replaceCallEngineRouteOnce(router, "c1", "/community-messenger/calls/c1?mode=active")).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("accept route duplicate calls move only once", () => {
    const replace = vi.fn();
    const router = { replace };
    const href = "/community-messenger/calls/c-accept?action=accept&nativeAccept=1&mode=active";
    expect(replaceCallEngineRouteOnce(router, "c-accept", href)).toBe(true);
    expect(replaceCallEngineRouteOnce(router, "c-accept", href)).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("builds active route", () => {
    expect(buildCallEngineActiveRoute("abc")).toContain("/community-messenger/calls/abc");
  });
});
