import { describe, expect, it } from "vitest";
import { isCallSurfaceTransitionPath } from "@/components/route-transition/call-surface-transition-path";

describe("R3-A 연출 판정의 통화 화면 주소", () => {
  it("예전 calls·실제 통화 화면 calls-v4·calls-v3 는 통화 화면", () => {
    expect(isCallSurfaceTransitionPath("/community-messenger/calls/outgoing")).toBe(true);
    expect(isCallSurfaceTransitionPath("/community-messenger/calls/abc?mode=active")).toBe(true);
    expect(isCallSurfaceTransitionPath("/community-messenger/calls-v4/abc?action=accept&source=native")).toBe(true);
    expect(isCallSurfaceTransitionPath("/community-messenger/calls-v3/abc")).toBe(true);
  });

  it("메신저 방·허브·그 밖 화면은 아님", () => {
    expect(isCallSurfaceTransitionPath("/community-messenger")).toBe(false);
    expect(isCallSurfaceTransitionPath("/community-messenger/rooms/r1")).toBe(false);
    expect(isCallSurfaceTransitionPath("/community-messenger/calls-v40/x")).toBe(false);
    expect(isCallSurfaceTransitionPath("/stores")).toBe(false);
  });
});
