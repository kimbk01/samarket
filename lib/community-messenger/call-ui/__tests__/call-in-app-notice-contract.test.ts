import { describe, expect, it } from "vitest";
import {
  classifyCallTerminalReason,
  getCallInAppNoticeSpec,
  mapTerminalReasonToCallInAppNoticeEvent,
  noticeEventForCallTerminalClass,
  shouldReplaceCallInAppNotice,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import { resolveCallInAppNoticeMessage } from "@/lib/community-messenger/stores/call-in-app-notice-store";

describe("call in-app notice contract", () => {
  it("maps peer_busy synonyms to peer_busy", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("callee_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("busy")).toBe("peer_busy");
  });

  it("normal hangup classifies as NORMAL_ENDED → silent (no remote_ended notice)", () => {
    expect(classifyCallTerminalReason("ended")).toBe("NORMAL_ENDED");
    expect(classifyCallTerminalReason("remote_ended")).toBe("NORMAL_ENDED");
    expect(noticeEventForCallTerminalClass("NORMAL_ENDED")).toBeNull();
    expect(mapTerminalReasonToCallInAppNoticeEvent("ended")).toBeNull();
    expect(mapTerminalReasonToCallInAppNoticeEvent("remote_ended")).toBeNull();
  });

  it("actionable failure still maps to call_failed", () => {
    expect(classifyCallTerminalReason("failed")).toBe("ACTIONABLE_FAILURE");
    expect(mapTerminalReasonToCallInAppNoticeEvent("failed")).toBe("call_failed");
  });

  it("terminal replaces reconnecting", () => {
    const reconnecting = getCallInAppNoticeSpec("reconnecting");
    const peerBusy = getCallInAppNoticeSpec("peer_busy");
    expect(shouldReplaceCallInAppNotice(reconnecting, peerBusy)).toBe(true);
    expect(shouldReplaceCallInAppNotice(peerBusy, reconnecting)).toBe(false);
  });

  it("resolves peer_busy message without raw code", () => {
    const msg = resolveCallInAppNoticeMessage("peer_busy");
    expect(msg.toLowerCase()).not.toBe("peer_busy");
    expect(msg.length).toBeGreaterThan(4);
  });
});
