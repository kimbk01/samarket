import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  isCallSessionHostedByActiveCallHost,
  isCommunityMessengerDedicatedCallSessionPath,
  writeActiveDirectVideoCallSession,
  writeMinimizedCommunityCallSession,
} from "@/lib/community-messenger/direct-call-minimize";

describe("direct-call-minimize host ownership", () => {
  afterEach(() => {
    clearAllCommunityCallLocalSessionFlags();
  });

  it("isCommunityMessengerDedicatedCallSessionPath matches calls route session id", () => {
    expect(
      isCommunityMessengerDedicatedCallSessionPath(
        "/community-messenger/calls/sess-abc",
        "sess-abc"
      )
    ).toBe(true);
    expect(
      isCommunityMessengerDedicatedCallSessionPath(
        "/community-messenger/calls/sess-abc",
        "other"
      )
    ).toBe(false);
    expect(isCommunityMessengerDedicatedCallSessionPath("/community-messenger/rooms/r1", "sess-abc")).toBe(
      false
    );
    expect(isCommunityMessengerDedicatedCallSessionPath("/community-messenger/calls/outgoing", "x")).toBe(
      false
    );
  });

  it("isCallSessionHostedByActiveCallHost reflects sessionStorage flags", () => {
    expect(isCallSessionHostedByActiveCallHost("s1")).toBe(false);
    writeActiveDirectVideoCallSession("s1");
    expect(isCallSessionHostedByActiveCallHost("s1")).toBe(true);
    expect(isCallSessionHostedByActiveCallHost("s2")).toBe(false);
    clearAllCommunityCallLocalSessionFlags();
    writeMinimizedCommunityCallSession("s3");
    expect(isCallSessionHostedByActiveCallHost("s3")).toBe(true);
  });
});
