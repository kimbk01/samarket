import { describe, expect, it } from "vitest";
import { flatCommentsToNeighborhoodTree } from "@/lib/neighborhood/comment-tree";

describe("flatCommentsToNeighborhoodTree", () => {
  it("builds nested replies under parent", () => {
    const tree = flatCommentsToNeighborhoodTree([
      {
        id: "r1",
        post_id: "p1",
        user_id: "u1",
        parent_id: null,
        content: "root",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_edited: false,
        author_name: "A",
        like_count: 0,
        liked_by_viewer: false,
      },
      {
        id: "c1",
        post_id: "p1",
        user_id: "u2",
        parent_id: "r1",
        content: "reply",
        created_at: "2026-01-01T00:01:00Z",
        updated_at: "2026-01-01T00:01:00Z",
        is_edited: false,
        author_name: "B",
        like_count: 1,
        liked_by_viewer: true,
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe("c1");
  });
});
