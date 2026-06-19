import { describe, expect, it, vi } from "vitest";
import {
  logIncomingConnectingShellFailed,
  logIncomingConnectingShellHidden,
  logIncomingConnectingShellVisible,
} from "@/lib/community-messenger/incoming-connecting-shell-trace";

describe("incoming-connecting-shell-trace", () => {
  it("emits p2-a shell lifecycle markers", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logIncomingConnectingShellVisible({ sessionId: "sess-1", callKind: "video" });
    logIncomingConnectingShellHidden({ sessionId: "sess-1" });
    logIncomingConnectingShellFailed({ sessionId: "sess-1", reason: "timeout" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[p2-a] incoming_shell_visible",
      expect.objectContaining({ sessionId: "sess-1", callKind: "video", at: expect.any(Number) })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[p2-a] incoming_shell_hidden",
      expect.objectContaining({ sessionId: "sess-1", at: expect.any(Number) })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[p2-a] incoming_shell_failed",
      expect.objectContaining({ sessionId: "sess-1", reason: "timeout", at: expect.any(Number) })
    );

    infoSpy.mockRestore();
  });
});
