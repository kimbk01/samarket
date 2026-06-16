import { describe, expect, it } from "vitest";
import {
  canShowIncoming,
  hydrateCallTerminalFromNative,
  isCallTerminal,
  latchCallTerminal,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";

describe("call-terminal-tombstone", () => {
  it("latchCallTerminal blocks canShowIncoming for same callId", () => {
    const hard = new Map<string, number>();
    const callId = "ssot-tomb-1";
    expect(canShowIncoming(callId, { hardClearedAt: hard })).toBe(true);
    latchCallTerminal(callId, "cancelled", { hardClearedAt: hard });
    expect(isCallTerminal(callId, { hardClearedAt: hard })).toBe(true);
    expect(canShowIncoming(callId, { hardClearedAt: hard })).toBe(false);
  });

  it("native tombstone hydrate blocks canShowIncoming on Web resume", () => {
    const hard = new Map<string, number>();
    const callId = "ssot-native-hydrate-1";
    const nativeConsumedIds = new Set<string>();
    hydrateCallTerminalFromNative(callId, "ended", {
      hardClearedAt: hard,
      nativeConsumedIds,
    });
    nativeConsumedIds.add(callId);
    expect(canShowIncoming(callId, { hardClearedAt: hard, nativeConsumedIds })).toBe(false);
  });

  it("different callId is not blocked by previous latch (redial)", () => {
    const hard = new Map<string, number>();
    latchCallTerminal("ssot-old", "ended", { hardClearedAt: hard });
    expect(canShowIncoming("ssot-new", { hardClearedAt: hard })).toBe(true);
  });
});
