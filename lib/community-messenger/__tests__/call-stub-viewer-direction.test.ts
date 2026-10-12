import { describe, expect, it } from "vitest";
import { resolveCallStubViewerIsCaller } from "@/lib/community-messenger/call-stub-viewer-direction";

const meta = { initiatorUserId: "caller", recipientUserId: "callee" };

describe("resolveCallStubViewerIsCaller", () => {
  it("declined (stub author = callee): callee sees incoming, caller sees outgoing", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "callee", metadata: meta })).toBe(false);
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: false, senderId: "callee", metadata: meta })).toBe(true);
  });
  it("ended/cancelled by caller (stub author = caller)", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "caller", metadata: meta })).toBe(true);
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: false, senderId: "caller", metadata: meta })).toBe(false);
  });
  it("falls back to isMine without initiator or for non call_stub", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "x", metadata: {} })).toBe(true);
    expect(resolveCallStubViewerIsCaller({ messageType: "text", isMine: false, senderId: "caller", metadata: meta })).toBe(false);
  });
});
