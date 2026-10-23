import { describe, expect, it } from "vitest";
import {
  classifyCallTerminalReason,
  getCallInAppNoticeSpec,
  mapTerminalReasonToCallInAppNoticeEvent,
  noticeEventForCallTerminalClass,
  shouldReplaceCallInAppNotice,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import {
  inferCallInAppNoticeEventFromFailureMessage,
  resolveCallInAppNoticeMessage,
} from "@/lib/community-messenger/stores/call-in-app-notice-store";

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

  it("NEW-11(web): media-permission-denied reason maps to permission_required (not generic call_failed)", () => {
    // Callee media-permission denial finalizes with "failed_permission"; existing classifier must
    // route it to the permission notice so the callee sees the permission banner.
    expect(classifyCallTerminalReason("failed_permission")).toBe("PERMISSION_REQUIRED");
    expect(mapTerminalReasonToCallInAppNoticeEvent("failed_permission")).toBe("permission_required");
  });

  it("CALL-04/CALL-02: caller no_answer classifies to NONE → silent, distinct from callee 'missed'", () => {
    // Caller-side no-answer / unconfirmed-missed finalizes with "no_answer": existing classifier
    // routes it to NONE (silent) so the caller never sees the callee-oriented "missed" notice.
    expect(classifyCallTerminalReason("no_answer")).toBe("NONE");
    expect(noticeEventForCallTerminalClass("NONE")).toBeNull();
    expect(mapTerminalReasonToCallInAppNoticeEvent("no_answer")).toBeNull();
    // The callee-side "missed" semantics stay unchanged and separate.
    expect(classifyCallTerminalReason("missed")).toBe("MISSED");
    expect(mapTerminalReasonToCallInAppNoticeEvent("missed")).toBe("missed");
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

  it("E-C1: failure-message infer keeps caller vs peer busy distinct", () => {
    expect(
      inferCallInAppNoticeEventFromFailureMessage(
        "You are already on another call, so a new call cannot be started."
      )
    ).toBe("caller_busy");
    expect(
      inferCallInAppNoticeEventFromFailureMessage(
        "다른 통화를 이용 중이라 새 통화를 시작할 수 없습니다."
      )
    ).toBe("caller_busy");
    expect(
      inferCallInAppNoticeEventFromFailureMessage("상대방이 현재 통화중입니다.")
    ).toBe("peer_busy");
    expect(
      inferCallInAppNoticeEventFromFailureMessage(
        "The other person is currently on another call."
      )
    ).toBe("peer_busy");
  });
});
