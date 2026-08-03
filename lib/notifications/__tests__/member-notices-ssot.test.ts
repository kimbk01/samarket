import { describe, expect, it } from "vitest";
import { mergeMemberNoticeListItems } from "@/lib/notifications/member-notices-ssot";

describe("member-notices-ssot", () => {
  it("merges board + push by createdAt desc", () => {
    const out = mergeMemberNoticeListItems({
      board: [
        {
          id: "board:1",
          title: "B",
          body: "b",
          createdAt: "2026-08-01T00:00:00.000Z",
          source: "board",
        },
      ],
      push: [
        {
          id: "push:2",
          title: "P",
          body: "p",
          createdAt: "2026-08-03T00:00:00.000Z",
          source: "push",
          notificationId: "2",
          campaignType: "notice",
        },
      ],
      limit: 10,
    });
    expect(out.map((x) => x.id)).toEqual(["push:2", "board:1"]);
  });
});
