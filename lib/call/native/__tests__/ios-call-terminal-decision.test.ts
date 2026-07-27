import { describe, expect, it } from "vitest";
import {
  canonicalizeCallSessionIdFromApnsUserInfo,
  canonicalizeTerminalKindFromApnsUserInfo,
  decideIosCallTerminal,
  isIosCallTerminalKind,
} from "@/lib/call/native/ios-call-terminal-decision";

describe("ios call terminal decision", () => {
  it("ends only tracked matching session", () => {
    expect(
      decideIosCallTerminal({
        callSessionId: "sess-a",
        kind: "call_canceled",
        trackedUuid: "11111111-1111-1111-1111-111111111111",
        alreadyEnded: false,
        isOutgoing: false,
        otherTrackedIncomingIds: ["sess-b"],
      })
    ).toEqual({ action: "end_tracked", reason: "tracked_match" });
  });

  it("no-ops unknown call id (registry miss)", () => {
    expect(
      decideIosCallTerminal({
        callSessionId: "missing",
        kind: "call_rejected",
        trackedUuid: null,
        alreadyEnded: false,
        isOutgoing: false,
        otherTrackedIncomingIds: [],
      })
    ).toEqual({ action: "noop", reason: "registry_miss" });
  });

  it("no-ops duplicate terminal", () => {
    expect(
      decideIosCallTerminal({
        callSessionId: "sess-a",
        kind: "call_ended",
        trackedUuid: "11111111-1111-1111-1111-111111111111",
        alreadyEnded: true,
        isOutgoing: false,
        otherTrackedIncomingIds: [],
      })
    ).toEqual({ action: "noop", reason: "duplicate" });
  });

  it("does not end outgoing CallKit via callee dismiss authority", () => {
    expect(
      decideIosCallTerminal({
        callSessionId: "sess-out",
        kind: "call_canceled",
        trackedUuid: "11111111-1111-1111-1111-111111111111",
        alreadyEnded: false,
        isOutgoing: true,
        otherTrackedIncomingIds: [],
      })
    ).toEqual({ action: "noop", reason: "outgoing_guard" });
  });

  it("rejects invalid payload", () => {
    expect(
      decideIosCallTerminal({
        callSessionId: " ",
        kind: "call_canceled",
        trackedUuid: "11111111-1111-1111-1111-111111111111",
        alreadyEnded: false,
        isOutgoing: false,
        otherTrackedIncomingIds: [],
      })
    ).toEqual({ action: "noop", reason: "invalid_payload" });
  });

  it("canonicalizes APNs userInfo fields", () => {
    expect(
      canonicalizeCallSessionIdFromApnsUserInfo({
        call_push_kind: "call_canceled",
        session_id: "abc",
      })
    ).toBe("abc");
    expect(
      canonicalizeTerminalKindFromApnsUserInfo({
        notification_type: "community_messenger_call_canceled",
      })
    ).toBe("call_canceled");
    expect(isIosCallTerminalKind("missed_call")).toBe(true);
    expect(isIosCallTerminalKind("incoming_call")).toBe(false);
  });
});
