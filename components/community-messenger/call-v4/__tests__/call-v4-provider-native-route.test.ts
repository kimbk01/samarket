import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  hydrateCallV4CalleeScreen: vi.fn(async () => true),
  callV4HandleRejectRoute: vi.fn(),
  callV4HandleRemoteTerminal: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: vi.fn(async () => ({ callKind: "video", status: "ringing" })),
}));

vi.mock("@/lib/call/native/native-owned-web-v4-ui-guard", () => ({
  resolveNativeOwnedWebV4UiBlock: vi.fn(async () => false),
}));

import {
  handleCallV4NativeRouteEvent,
  resetCallV4AcceptRouteReplaceForTests,
} from "@/components/community-messenger/call-v4/CallV4Provider";
import { resolveNativeOwnedWebV4UiBlock } from "@/lib/call/native/native-owned-web-v4-ui-guard";
import { resetNativeAcceptInflightForTests } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const ACCEPT_PATH =
  "/community-messenger/calls-v4/call-route-1?action=accept&source=native_accept";

describe("handleCallV4NativeRouteEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(resolveNativeOwnedWebV4UiBlock).mockReset();
    vi.mocked(resolveNativeOwnedWebV4UiBlock).mockResolvedValue(false);
    resetCallV4AcceptRouteReplaceForTests();
    resetNativeAcceptInflightForTests();
    useCallV4Store.getState().resetToIdle();
  });

  it("replaces route on calls-v4 accept native route event", async () => {
    const replace = vi.fn();
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") logs.push(args[1]);
      originalInfo(...args);
    };
    try {
      handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
      await vi.waitFor(() => {
        expect(replace).toHaveBeenCalledTimes(1);
      });
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

  it("skips duplicate replace for the same callId", async () => {
    const replace = vi.fn();
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledTimes(1);
    });
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("skips replace when native-owned Web V4 UI is blocked", async () => {
    vi.mocked(resolveNativeOwnedWebV4UiBlock).mockResolvedValue(true);
    const replace = vi.fn();
    handleCallV4NativeRouteEvent(ACCEPT_PATH, { replace }, "/philife");
    await vi.waitFor(() => {
      expect(resolveNativeOwnedWebV4UiBlock).toHaveBeenCalledWith("call-route-1", "native_accept_route");
    });
    expect(replace).not.toHaveBeenCalled();
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
