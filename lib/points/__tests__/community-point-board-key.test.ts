import { describe, expect, it } from "vitest";
import { resolveCommunityBoardKey } from "@/lib/points/community-point-board-key";

describe("resolveCommunityBoardKey", () => {
  it("maps question posts to qna via isQuestion or topicSlug", () => {
    expect(resolveCommunityBoardKey({ isQuestion: true })).toBe("qna");
    expect(resolveCommunityBoardKey({ topicSlug: "question" })).toBe("qna");
    /** category alone only when topic missing (legacy bridge) */
    expect(resolveCommunityBoardKey({ category: "question" })).toBe("qna");
    expect(resolveCommunityBoardKey({ topicSlug: "travel", category: "question" })).toBe("general");
  });

  it("maps other posts to general", () => {
    expect(resolveCommunityBoardKey({ category: "daily" })).toBe("general");
    expect(resolveCommunityBoardKey({ topicSlug: "travel", category: "etc" })).toBe("general");
    expect(resolveCommunityBoardKey({})).toBe("general");
  });
});
