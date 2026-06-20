/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { installCallSystemPipBridge } from "@/lib/community-messenger/call-system-pip-bridge";

describe("call-system-pip-bridge", () => {
  it("forwards dibay:call-pip events", () => {
    const handler = vi.fn();
    const off = installCallSystemPipBridge({ onPipModeChange: handler });
    window.dispatchEvent(
      new CustomEvent("dibay:call-pip", { detail: { sessionId: "sess-1", active: true } })
    );
    expect(handler).toHaveBeenCalledWith({ sessionId: "sess-1", active: true });
    off();
  });
});
