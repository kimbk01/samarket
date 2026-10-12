import { describe, expect, it } from "vitest";
import { resolveCallStubViewerIsCaller } from "@/lib/community-messenger/call-stub-viewer-direction";

const CALLER = "11111111-1111-4111-8111-111111111111";
const CALLEE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function stub(args: { sender: string; viewer: string; meta?: Record<string, unknown> | null }) {
  return {
    messageType: "call_stub" as const,
    senderId: args.sender,
    isMine: args.sender === args.viewer,
    metadata:
      args.meta === undefined ? { initiatorUserId: CALLER, recipientUserId: CALLEE } : args.meta,
  };
}

describe("resolveCallStubViewerIsCaller (D-6)", () => {
  // 작성자 = 종료 행위자. 어떤 행위자가 썼든 발신자 화면엔 「발신」(오른쪽), 수신자 화면엔 「수신」(왼쪽).
  it.each([
    ["callee rejected (stub by callee)", CALLEE],
    ["caller cancelled (stub by caller)", CALLER],
    ["callee ended (stub by callee)", CALLEE],
    ["caller ended (stub by caller)", CALLER],
  ])("%s → caller sees outgoing, callee sees incoming", (_label, sender) => {
    expect(resolveCallStubViewerIsCaller(stub({ sender, viewer: CALLER }))).toBe(true);
    expect(resolveCallStubViewerIsCaller(stub({ sender, viewer: CALLEE }))).toBe(false);
  });

  it("is case-insensitive on ids", () => {
    const item = stub({ sender: CALLEE, viewer: CALLER });
    item.metadata = { initiatorUserId: CALLER.toUpperCase(), recipientUserId: CALLEE };
    expect(resolveCallStubViewerIsCaller({ ...item, senderId: CALLEE.toUpperCase() })).toBe(true);
  });

  it("keeps isMine when party metadata is missing (legacy stubs)", () => {
    expect(resolveCallStubViewerIsCaller(stub({ sender: CALLEE, viewer: CALLER, meta: null }))).toBe(false);
    expect(
      resolveCallStubViewerIsCaller(stub({ sender: CALLEE, viewer: CALLEE, meta: { initiatorUserId: CALLER } }))
    ).toBe(true);
  });

  it("keeps isMine when the author is not a 1:1 party (group / third party) — never guesses", () => {
    expect(resolveCallStubViewerIsCaller(stub({ sender: OTHER, viewer: CALLER }))).toBe(false);
    expect(resolveCallStubViewerIsCaller(stub({ sender: OTHER, viewer: OTHER }))).toBe(true);
  });

  it("does not touch non call_stub messages", () => {
    expect(
      resolveCallStubViewerIsCaller({ messageType: "text", senderId: CALLEE, isMine: false, metadata: null })
    ).toBe(false);
    expect(
      resolveCallStubViewerIsCaller({ messageType: "text", senderId: CALLER, isMine: true, metadata: null })
    ).toBe(true);
  });
});
