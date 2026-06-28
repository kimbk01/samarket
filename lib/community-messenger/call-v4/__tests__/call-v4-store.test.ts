/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invokeCallV4ConnectedBackMinimize,
  registerCallV4ConnectedBackMinimize,
  resetCallV4ConnectedBackMinimizeForTests,
  useCallV4Store,
} from "@/lib/community-messenger/call-v4/call-v4-store";

describe("useCallV4Store setPhase connected downgrade guard", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    resetCallV4ConnectedBackMinimizeForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it.each(["outgoing_ringing", "creating", "incoming_ringing", "joining", "accepting"] as const)(
    "blocks downgrade from connected to %s",
    (toPhase) => {
      useCallV4Store.getState().setPhase("connected");
      useCallV4Store.getState().setPhase(toPhase);
      expect(useCallV4Store.getState().phase).toBe("connected");
    },
  );

  it("allows transition from connected to ending", () => {
    useCallV4Store.getState().setPhase("connected");
    useCallV4Store.getState().setPhase("ending");
    expect(useCallV4Store.getState().phase).toBe("ending");
  });

  it("allows resetToIdle from connected", () => {
    useCallV4Store.getState().setPhase("connected");
    useCallV4Store.getState().resetToIdle();
    expect(useCallV4Store.getState().phase).toBe("idle");
  });
});

describe("registerCallV4ConnectedBackMinimize", () => {
  beforeEach(() => {
    resetCallV4ConnectedBackMinimizeForTests();
  });

  it("invokes registered minimize handler", () => {
    const handler = vi.fn();
    registerCallV4ConnectedBackMinimize(handler);
    invokeCallV4ConnectedBackMinimize();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
