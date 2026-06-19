import { describe, expect, it } from "vitest";
import {
  extractCommunityMessengerCallSessionIdFromPathname,
  isIncomingAcceptCallSurface,
  readIncomingAcceptTransitionSessionId,
  shouldShowIncomingAcceptTransitionShell,
} from "@/lib/community-messenger/incoming-accept-transition-route";

describe("incoming-accept-transition-route", () => {
  it("detects accept call surface by session and query", () => {
    expect(
      isIncomingAcceptCallSurface(
        "/community-messenger/calls/sess-1",
        "action=accept&nativeAccept=1",
        "sess-1"
      )
    ).toBe(true);
    expect(
      isIncomingAcceptCallSurface("/community-messenger/calls/sess-1", "", "sess-1")
    ).toBe(false);
    expect(
      isIncomingAcceptCallSurface("/community-messenger?section=call_logs", "action=accept", "sess-1")
    ).toBe(false);
  });

  it("extracts session id from pathname", () => {
    expect(extractCommunityMessengerCallSessionIdFromPathname("/community-messenger/calls/abc")).toBe(
      "abc"
    );
    expect(extractCommunityMessengerCallSessionIdFromPathname("/community-messenger")).toBeNull();
  });

  it("shows transition shell while pending but not on accept call page", () => {
    const pending = shouldShowIncomingAcceptTransitionShell(
      "/community-messenger?section=call_logs",
      ""
    );
    expect(pending.show).toBe(false);

    const onLogs = shouldShowIncomingAcceptTransitionShell(
      "/community-messenger/calls/logs",
      "callId=sess-1"
    );
    expect(onLogs.show).toBe(false);
  });

  it("readIncomingAcceptTransitionSessionId returns null without browser storage", () => {
    expect(readIncomingAcceptTransitionSessionId()).toBeNull();
  });
});
