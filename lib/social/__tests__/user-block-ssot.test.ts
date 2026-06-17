import { describe, expect, it } from "vitest";
import {
  filterCommentRowsExcludingBlockedRelations,
  isNotificationSuppressedForActor,
} from "@/lib/social/user-block-ssot";

describe("filterCommentRowsExcludingBlockedRelations", () => {
  const rows = [
    { id: "c1", user_id: "author-a", parent_id: null },
    { id: "c2", user_id: "author-b", parent_id: null },
    { id: "c3", user_id: "author-c", parent_id: "c2" },
    { id: "c4", user_id: "author-d", parent_id: "c3" },
  ];

  it("hides blocked author's own comments", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-b"]));
    expect(out.map((r) => r.id)).toEqual(["c1"]);
  });

  it("hides replies under blocked ancestor authors", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-b"]));
    expect(out.some((r) => r.id === "c3")).toBe(false);
    expect(out.some((r) => r.id === "c4")).toBe(false);
  });

  it("keeps unrelated threads when only one author is blocked", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-a"]));
    expect(out.map((r) => r.id).sort()).toEqual(["c2", "c3", "c4"]);
  });
});

describe("isNotificationSuppressedForActor", () => {
  it("suppresses when either direction blocked", () => {
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: true,
        blockedByPeer: false,
        blockedEitherWay: true,
      })
    ).toBe(true);
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: false,
        blockedByPeer: true,
        blockedEitherWay: true,
      })
    ).toBe(true);
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: false,
        blockedByPeer: false,
        blockedEitherWay: false,
      })
    ).toBe(false);
  });
});
