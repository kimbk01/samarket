import { describe, expect, it } from "vitest";
import { resolveCommunityBoardKey } from "@/lib/points/community-point-board-key";

describe("resolveCommunityBoardKey", () => {
  it("maps question posts to qna", () => {
    expect(resolveCommunityBoardKey({ isQuestion: true })).toBe("qna");
    expect(resolveCommunityBoardKey({ category: "question" })).toBe("qna");
    expect(resolveCommunityBoardKey({ topicSlug: "question" })).toBe("qna");
  });

  it("maps other posts to general", () => {
    expect(resolveCommunityBoardKey({ category: "daily" })).toBe("general");
    expect(resolveCommunityBoardKey({})).toBe("general");
  });
});
