import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  hydrateCallV4CalleeScreen: vi.fn(async () => true),
  callV4HandleRejectRoute: vi.fn(),
  callV4HandleRemoteTerminal: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: vi.fn(async () => ({ callKind: "video", status: "ringing" })),
}));

import {
  handleCallV4NativeRouteEvent,
  resetCallV4AcceptRouteReplaceForTests,
} from "@/components/community-messenger/call-v4/CallV4Provider";
import { resetNativeAcceptInflightForTests } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const ACCEPT_PATH =
  "/community-messenger/calls-v4/call-route-1?action=accept&source=native_accept";

describe("handleCallV4NativeRouteEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    resetCallV4AcceptRouteReplaceForTests();
    resetNativeAcceptInflightForTests();
    useCallV4Store.getState().resetToIdle();
  });

  it("replaces route on calls-v4 accept native route event", () => {
    const replace = vi.fn();
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") logs.push(args[1]);
      originalInfo(...args);
    };
    try {
      handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(ACCEPT_PATH);
      expect(logs).toContain("call_v4_route_event_received");
      expect(logs).toContain("call_v4_route_accept_seeded");
      expect(logs).toContain("router_replace_calls_v4_accept");
    } finally {
      console.info = originalInfo;
    }
  });

  it("skips replace when already on the same calls-v4 accept route", () => {
    const replace = vi.fn();
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, ACCEPT_PATH);
    expect(replace).not.toHaveBeenCalled();
  });

  it("skips duplicate replace for the same callId", () => {
    const replace = vi.fn();
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("logs skipped duplicate reason for second accept event", () => {
    const replace = vi.fn();
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") logs.push(args[1]);
      originalInfo(...args);
    };
    try {
      handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
      handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
      expect(logs.filter((step) => step === "router_replace_calls_v4_accept_skipped_duplicate")).toHaveLength(1);
    } finally {
      console.info = originalInfo;
    }
  });
});
