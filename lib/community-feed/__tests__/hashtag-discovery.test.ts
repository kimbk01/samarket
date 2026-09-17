import { describe, expect, it } from "vitest";
import {
  communityHashtagIlikeOrFilter,
  communityKeywordIlikeOrFilter,
  communityPostTextMatchesHashtag,
  communityPostTextMatchesKeyword,
  escapeIlikePattern,
  normalizeCommunityHashtagQuery,
  sanitizeCommunityKeywordQuery,
} from "@/lib/community-feed/hashtag-discovery";

describe("community hashtag discovery", () => {
  it("normalizes tag query (strip #, lower, invalid reject)", () => {
    expect(normalizeCommunityHashtagQuery("#Food")).toBe("food");
    expect(normalizeCommunityHashtagQuery("  ##여행  ")).toBe("여행");
    expect(normalizeCommunityHashtagQuery("bad tag")).toBe("");
    expect(normalizeCommunityHashtagQuery("")).toBe("");
  });

  it("matches exact token and not prefix-inside longer tag", () => {
    expect(
      communityPostTextMatchesHashtag({ title: "hello #foodie night", content: "" }, "food")
    ).toBe(false);
    expect(
      communityPostTextMatchesHashtag({ title: "hello #food night", content: "" }, "food")
    ).toBe(true);
    expect(
      communityPostTextMatchesHashtag({ title: "", content: "오늘 #여행 추천", summary: "" }, "여행")
    ).toBe(true);
    expect(
      communityPostTextMatchesHashtag({ title: "no tags", content: "plain", summary: "" }, "여행")
    ).toBe(false);
  });

  it("escapes ilike wildcards and builds or filter", () => {
    expect(escapeIlikePattern("a%b_c")).toBe("a\\%b\\_c");
    expect(communityHashtagIlikeOrFilter("food")).toContain("title.ilike.%#food%");
    expect(communityHashtagIlikeOrFilter("food")).toContain("content.ilike.%#food%");
  });

  it("keyword query matches title/content/summary without hashtag tokenization", () => {
    expect(sanitizeCommunityKeywordQuery("  치킨,분식  ")).toBe("치킨 분식");
    expect(communityPostTextMatchesKeyword({ title: "오늘 치킨", content: "", summary: "" }, "치킨")).toBe(true);
    expect(communityPostTextMatchesKeyword({ title: "", content: "후라이드", summary: "" }, "후라이드")).toBe(true);
    expect(communityPostTextMatchesKeyword({ title: "분식", content: "", summary: "" }, "치킨")).toBe(false);
    expect(communityKeywordIlikeOrFilter("치킨")).toContain("title.ilike.%치킨%");
  });
});
