import { describe, expect, it } from "vitest";
import {
  communityFeedTopBadges,
  isCommunityNoticeLive,
  isCommunityNoticeScheduled,
  selectCommunityFeedTopRows,
} from "@/lib/community-feed/community-feed-top-posts";

const NOW = Date.parse("2026-10-19T04:00:00Z");

describe("community feed top posts (공지·고정)", () => {
  const rows = [
    { id: "pin-feed", topic_slug: "free", pinned_at: "2026-10-18T00:00:00Z", pin_scope: "feed", pin_rank: 1 },
    { id: "pin-topic", topic_slug: "free", pinned_at: "2026-10-18T00:00:00Z", pin_scope: "topic", pin_rank: 0 },
    { id: "pin-expired", topic_slug: "free", pinned_at: "2026-10-01T00:00:00Z", pinned_until: "2026-10-10T00:00:00Z", pin_scope: "feed" },
    { id: "notice-live", topic_slug: "info", is_notice: true, notice_starts_at: "2026-10-18T00:00:00Z", notice_ends_at: "2026-10-30T00:00:00Z" },
    { id: "notice-scheduled", topic_slug: "info", is_notice: true, notice_starts_at: "2026-10-25T00:00:00Z" },
  ];

  it("main feed: live notices first, then feed-scope pins; expired/topic pins excluded", () => {
    expect(selectCommunityFeedTopRows(rows, { nowMs: NOW }).map((r) => r.id)).toEqual(["notice-live", "pin-feed"]);
  });

  it("topic feed: only that topic's notices and topic-scope pins", () => {
    expect(selectCommunityFeedTopRows(rows, { filterTopicSlug: "free", nowMs: NOW }).map((r) => r.id)).toEqual(["pin-topic"]);
    expect(selectCommunityFeedTopRows(rows, { filterTopicSlug: "info", nowMs: NOW }).map((r) => r.id)).toEqual(["notice-live"]);
    expect(selectCommunityFeedTopRows(rows, { filterTopicSlug: "meetup", nowMs: NOW })).toEqual([]);
  });

  it("notice window and badges", () => {
    expect(isCommunityNoticeLive(rows[3]!, NOW)).toBe(true);
    expect(isCommunityNoticeLive(rows[4]!, NOW)).toBe(false);
    expect(isCommunityNoticeScheduled(rows[4]!, NOW)).toBe(true);
    expect(communityFeedTopBadges(rows[0]!, { nowMs: NOW })).toEqual({ isNotice: false, isPinned: true });
    expect(communityFeedTopBadges(rows[1]!, { filterTopicSlug: "free", nowMs: NOW })).toEqual({ isNotice: false, isPinned: true });
  });
});
