import { describe, expect, it } from "vitest";
import {
  resolveCanonicalCallLogCallerUserId,
  resolveCanonicalCallLogPeerUserId,
  resolveViewerCallHistoryDirection,
  resolveViewerCallHistoryPeerUserId,
} from "@/lib/community-messenger/call-authority/call-history-peer-authority";

describe("call-history-peer-authority", () => {
  const caller = "caller-a";
  const callee = "callee-b";

  it("canonical storage: caller=initiator peer=recipient for cancel/reject/missed/ended alike", () => {
    expect(resolveCanonicalCallLogCallerUserId({ initiatorUserId: caller })).toBe(caller);
    expect(
      resolveCanonicalCallLogPeerUserId({ initiatorUserId: caller, recipientUserId: callee }),
    ).toBe(callee);
  });

  it("rejects self-peer contamination (initiator === recipient)", () => {
    expect(
      resolveCanonicalCallLogPeerUserId({ initiatorUserId: caller, recipientUserId: caller }),
    ).toBeNull();
  });

  it("viewer peers are mirrors: caller→callee, callee→caller", () => {
    expect(
      resolveViewerCallHistoryPeerUserId({
        viewerUserId: caller,
        initiatorUserId: caller,
        recipientUserId: callee,
      }),
    ).toBe(callee);
    expect(
      resolveViewerCallHistoryPeerUserId({
        viewerUserId: callee,
        initiatorUserId: caller,
        recipientUserId: callee,
      }),
    ).toBe(caller);
  });

  it("viewer directions: outgoing for initiator, incoming for recipient", () => {
    expect(
      resolveViewerCallHistoryDirection({ viewerUserId: caller, initiatorUserId: caller }),
    ).toBe("outgoing");
    expect(
      resolveViewerCallHistoryDirection({ viewerUserId: callee, initiatorUserId: caller }),
    ).toBe("incoming");
  });
});
