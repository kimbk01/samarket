import { describe, expect, it } from "vitest";
import {
  diffCommunityFeedOps,
  mergeCommunityFeedOpsWithCurrent,
  pickCommunityFeedOpsPatch,
  sameSettingsTimestamp,
} from "@/lib/admin/community-admin/community-settings-merge";
import { mergeCommunityFeedOps } from "@/lib/community-feed/community-ops-settings";

const CURRENT = {
  banned_words: ["spam", "scam"],
  max_title_length: 120,
  max_content_length: 5000,
  max_comment_length: 800,
  max_posts_per_day: 10,
  min_comment_interval_sec: 30,
};

describe("community settings PUT merges with the current stored value (C-29)", () => {
  it("fields missing from the request keep the stored value, not defaults", () => {
    const merged = mergeCommunityFeedOpsWithCurrent(CURRENT, { max_title_length: 150 });
    expect(merged.max_title_length).toBe(150);
    expect(merged.banned_words).toEqual(["spam", "scam"]);
    expect(merged.max_posts_per_day).toBe(10);
    expect(merged.min_comment_interval_sec).toBe(30);
    // the old behaviour (merge with defaults) would have wiped banned words
    expect(mergeCommunityFeedOps({ max_title_length: 150 }).banned_words).toEqual([]);
  });

  it("no stored row → defaults + request", () => {
    const merged = mergeCommunityFeedOpsWithCurrent(null, { banned_words: ["X "] });
    expect(merged.banned_words).toEqual(["x"]);
    expect(merged.max_title_length).toBe(200);
  });

  it("values are still clamped", () => {
    expect(mergeCommunityFeedOpsWithCurrent(CURRENT, { max_title_length: 99999 }).max_title_length).toBe(500);
  });

  it("only settings fields are picked from the body (expectedUpdatedAt ignored)", () => {
    const patch = pickCommunityFeedOpsPatch({ expectedUpdatedAt: "x", max_posts_per_day: 3, unknown: 1 });
    expect(patch).toEqual({ max_posts_per_day: 3 });
  });

  it("diff lists only changed fields for the audit record", () => {
    const before = mergeCommunityFeedOps(CURRENT);
    const after = mergeCommunityFeedOpsWithCurrent(CURRENT, { max_posts_per_day: 3, max_title_length: 120 });
    const d = diffCommunityFeedOps(before, after);
    expect(d.changed).toEqual(["max_posts_per_day"]);
    expect(d.before).toEqual({ max_posts_per_day: 10 });
    expect(d.after).toEqual({ max_posts_per_day: 3 });
  });

  it("CAS timestamp compare ignores format differences only", () => {
    expect(sameSettingsTimestamp("2026-10-19T01:02:03.456+00:00", "2026-10-19T01:02:03.456Z")).toBe(true);
    expect(sameSettingsTimestamp("2026-10-19T01:02:03.456Z", "2026-10-19T01:02:04.456Z")).toBe(false);
    expect(sameSettingsTimestamp(null, null)).toBe(true);
    expect(sameSettingsTimestamp("2026-10-19T01:02:03Z", null)).toBe(false);
  });
});
