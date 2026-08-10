import { describe, expect, it } from "vitest";
import { buildFeedChipsFromPhilifeTopicOptionsJson } from "@/lib/philife/philife-feed-chips-from-topic-options";

describe("buildFeedChipsFromPhilifeTopicOptionsJson", () => {
  it("returns content topics only (no All/Home chip)", () => {
    const { chips } = buildFeedChipsFromPhilifeTopicOptionsJson({
      ok: true,
      showAllFeedTab: false,
      feedChips: [
        { slug: "philippines", name: "필리핀생활" },
        { slug: "daily", name: "일상생활" },
      ],
      writeTopics: [],
    });
    expect(chips.map((c) => c.slug)).toEqual(["philippines", "daily"]);
  });

  it("excludes is_feed_sort, sort_slot, recommend*, popular, home, local, latest", () => {
    const { chips } = buildFeedChipsFromPhilifeTopicOptionsJson({
      ok: true,
      showAllFeedTab: true,
      feedChips: [
        {
          slug: "recommended",
          name: "추천",
          is_feed_sort: true,
          sort_slot: "recommend",
        },
        { slug: "popular", name: "인기", is_feed_sort: true, sort_slot: "popular" },
        { slug: "legacy-sort", name: "정렬", is_feed_sort: true },
        { slug: "slot-only", name: "슬롯", sort_slot: "popular" },
        { slug: "home", name: "홈" },
        { slug: "local", name: "동네" },
        { slug: "latest", name: "최신" },
        { slug: "travel", name: "여행" },
      ],
      writeTopics: [],
    });
    expect(chips.map((c) => c.slug)).toEqual(["travel"]);
  });
});
