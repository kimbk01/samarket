import { describe, expect, it } from "vitest";
import {
  isCommunityMessengerTempCallSessionId,
  isOutgoingTempCallBootstrapCancelled,
  markOutgoingTempCallBootstrapCancelled,
} from "@/lib/community-messenger/call-session-navigation-seed";

describe("outgoing temp bootstrap cancel guard", () => {
  it("marks and reads cancelled tmp bootstrap", () => {
    const tmpId = "tmp_test-cancel-guard";
    expect(isCommunityMessengerTempCallSessionId(tmpId)).toBe(true);
    expect(isOutgoingTempCallBootstrapCancelled(tmpId)).toBe(false);
    markOutgoingTempCallBootstrapCancelled(tmpId);
    expect(isOutgoingTempCallBootstrapCancelled(tmpId)).toBe(true);
  });
});
