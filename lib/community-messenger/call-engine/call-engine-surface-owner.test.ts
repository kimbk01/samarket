import { describe, expect, it } from "vitest";
import {
  claimCallEngineSurfaceOwner,
  resolveCallEngineIncomingSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import {
  markCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

describe("call-engine surface owner", () => {
  it("uses web banner in foreground", () => {
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c1",
      appVisibility: "foreground",
      hasNativeFsi: false,
      requestOwner: "web_in_app_banner",
    });
    expect(owner).toBe("web_in_app_banner");
  });

  it("uses native owner when locked", () => {
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c2",
      appVisibility: "locked",
      hasNativeFsi: true,
      requestOwner: "web_in_app_banner",
    });
    expect(owner).toBe("native_locked_screen");
  });

  it("keeps surface exclusive by callId", () => {
    resetCallEngineLocksForTests();
    expect(claimCallEngineSurfaceOwner("c3", "web_call_screen")).toBe(true);
    expect(claimCallEngineSurfaceOwner("c3", "web_in_app_banner")).toBe(false);
  });

  it("allows dock_or_pip as foreground presentation owner", () => {
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c4",
      appVisibility: "foreground",
      hasNativeFsi: false,
      requestOwner: "dock_or_pip",
    });
    expect(owner).toBe("dock_or_pip");
  });

  it("blocks surface owner after terminal consumed", () => {
    markCallEngineTerminalConsumed("c5");
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c5",
      appVisibility: "foreground",
      hasNativeFsi: false,
      requestOwner: "dock_or_pip",
    });
    expect(owner).toBeNull();
  });
});
