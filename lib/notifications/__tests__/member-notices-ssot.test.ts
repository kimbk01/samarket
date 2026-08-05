import { describe, expect, it } from "vitest";
import { mergeMemberNoticeListItems } from "@/lib/notifications/member-notices-ssot";
import { buildAppNoticeDetailPath, parseAppNoticeIdFromBoardListId } from "@/lib/notices/app-notice-paths";

describe("app-notice-paths", () => {
  it("builds CS notice detail path", () => {
    expect(buildAppNoticeDetailPath("abc-1")).toBe("/mypage/notices/abc-1");
  });

  it("parses board list ids", () => {
    expect(parseAppNoticeIdFromBoardListId("board:uuid-9")).toBe("uuid-9");
    expect(parseAppNoticeIdFromBoardListId("uuid-9")).toBe("uuid-9");
  });
});

describe("member-notices-ssot (legacy helper — Phase 7 REMOVE)", () => {
  it("still sorts when called (API no longer merges push)", () => {
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
      push: [],
      limit: 10,
    });
    expect(out.map((x) => x.id)).toEqual(["board:1"]);
  });
});
