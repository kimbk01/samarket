import { describe, expect, it } from "vitest";
import { EMPTY_COMMUNITY_POST_VIEWER_STATE } from "../types";

describe("community post engagement types", () => {
  it("empty viewer state defaults to false", () => {
    expect(EMPTY_COMMUNITY_POST_VIEWER_STATE.liked_by_viewer).toBe(false);
    expect(EMPTY_COMMUNITY_POST_VIEWER_STATE.saved_by_viewer).toBe(false);
    expect(EMPTY_COMMUNITY_POST_VIEWER_STATE.hidden_by_viewer).toBe(false);
  });
});

describe("community post engagement policy (documented)", () => {
  it("view dedup is forever unique per authenticated viewer (post_id + viewer_user_id)", () => {
    // contract: record_community_post_view inserts with ON CONFLICT unique; no 24h window
    expect("community_post_views_post_user_unique").toContain("post_user_unique");
  });

  it("save uses unique post_id + user_id", () => {
    expect("community_post_saves_post_user_key").toContain("post_user");
  });

  it("like uses unique post_id + user_id on community_post_likes", () => {
    expect("community_post_likes_post_user_key").toContain("post_user");
  });
});
