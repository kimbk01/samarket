import { describe, expect, it } from "vitest";
import { formatCallHistoryDurationSeconds } from "@/lib/community-messenger/call-history/call-duration";

describe("call-duration", () => {
  it("formats duration label", () => {
    expect(formatCallHistoryDurationSeconds(190)).toMatch(/3/);
  });
});
