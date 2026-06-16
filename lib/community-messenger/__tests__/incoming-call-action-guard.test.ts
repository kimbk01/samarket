import { describe, expect, it, beforeEach } from "vitest";
import {
  isIncomingCallAcceptInFlight,
  releaseIncomingCallAccept,
  resetIncomingCallActionGuards,
  tryClaimIncomingCallAccept,
  tryClaimIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-action-guard";

describe("incoming-call-action-guard", () => {
  beforeEach(() => {
    resetIncomingCallActionGuards();
  });

  it("allows a single accept claim per session", () => {
    expect(tryClaimIncomingCallAccept("s1")).toBe(true);
    expect(tryClaimIncomingCallAccept("s1")).toBe(false);
    expect(isIncomingCallAcceptInFlight("s1")).toBe(true);
    releaseIncomingCallAccept("s1");
    expect(tryClaimIncomingCallAccept("s1")).toBe(true);
  });

  it("blocks accept when reject is in flight", () => {
    expect(tryClaimIncomingCallReject("s1")).toBe(true);
    expect(tryClaimIncomingCallAccept("s1")).toBe(false);
  });
});
