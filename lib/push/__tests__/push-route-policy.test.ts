import { describe, expect, it } from "vitest";
import { shouldReplaceRoute } from "@/lib/push/push-route-policy";

describe("push-route-policy", () => {
  it("replaces call accept routes", () => {
    expect(shouldReplaceRoute("/community-messenger/calls/s1?action=accept")).toBe(true);
    expect(shouldReplaceRoute("/community-messenger/calls/logs?callId=s1")).toBe(false);
    expect(shouldReplaceRoute("/community-messenger/rooms/r1")).toBe(false);
  });
});
