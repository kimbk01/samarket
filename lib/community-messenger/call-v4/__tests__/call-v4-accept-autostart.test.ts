/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4Accept: vi.fn(),
}));

import { callV4Accept } from "@/lib/community-messenger/call-v4/call-v4-actions";
import {
  resetNativeAcceptInflightForTests,
  setNativeAcceptInflight,
  tryStartCallV4NativeAcceptAutostart,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";

describe("CallV4Screen native accept autostart guard", () => {
  beforeEach(() => {
    resetNativeAcceptInflightForTests();
    vi.mocked(callV4Accept).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("runs callV4Accept only once across duplicate autostart attempts", () => {
    setNativeAcceptInflight("call-screen", "native_accept");
    const router = { push: vi.fn(), replace: vi.fn() };

    const first = tryStartCallV4NativeAcceptAutostart("call-screen");
    if (first) {
      void callV4Accept("call-screen", router, { skipRoute: true, source: "native_accept" });
    }

    const second = tryStartCallV4NativeAcceptAutostart("call-screen");
    if (second) {
      void callV4Accept("call-screen", router, { skipRoute: true, source: "native_accept" });
    }

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(callV4Accept).toHaveBeenCalledTimes(1);
  });
});
