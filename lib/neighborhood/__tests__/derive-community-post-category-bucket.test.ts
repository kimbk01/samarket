import { describe, expect, it } from "vitest";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";

describe("deriveCommunityPostCategoryBucket", () => {
  it("CASE A: custom topic → etc filler (not topic identity)", () => {
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "travel", isMeetup: false })
    ).toBe("etc");
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "phlifee", isMeetup: false })
    ).toBe("etc");
  });

  it("CASE B: question enum slug → question bucket (side-effect path may use is_question separately)", () => {
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "question", isMeetup: false })
    ).toBe("question");
  });

  it("CASE C: meetup special behavior wins", () => {
    expect(
      deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: "travel", isMeetup: true })
    ).toBe("meetup");
  });
});
