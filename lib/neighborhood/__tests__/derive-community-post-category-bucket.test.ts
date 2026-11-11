import { describe, expect, it } from "vitest";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";

describe("deriveCommunityPostCategoryBucket", () => {
  it("CASE A: custom topic → etc filler (not topic identity)", () => {
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "travel" })
    ).toBe("etc");
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "phlifee" })
    ).toBe("etc");
  });

  it("CASE B: question enum slug → question bucket (side-effect path may use is_question separately)", () => {
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "question" })
    ).toBe("question");
  });

});
