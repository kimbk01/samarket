import { describe, expect, it } from "vitest";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

describe("resolveCommunityTopicUILabel — 다른 언어로 대체하지 않는다", () => {
  it("EN: name_en 이 있으면 name_en", () => {
    expect(resolveCommunityTopicUILabel("en", "기본 이름", "English Name", "topic")).toBe("English Name");
  });

  it("EN: name_en 이 없으면 한국어 이름을 쓰지 않는다 — 동네 카테고리 slug 는 카탈로그, 그 외는 Topic", () => {
    expect(resolveCommunityTopicUILabel("en", "질문있어요", null, "question")).toBe("Questions");
    expect(resolveCommunityTopicUILabel("en", "필리핀생할", null, "phlifee")).toBe("Topic");
    expect(resolveCommunityTopicUILabel("en", "", null, "philippines-news")).toBe("Topic");
  });

  it("KO: 어드민 이름", () => {
    expect(resolveCommunityTopicUILabel("ko", "QA IA msmp0i3x2", null, "qa-ia-msmp0i3x")).toBe("QA IA msmp0i3x2");
  });

  it("KO: 이름이 비어 있어도 name_en 을 쓰지 않는다", () => {
    expect(resolveCommunityTopicUILabel("ko", "", "English Name", "topic")).toBe("주제");
    expect(resolveCommunityTopicUILabel("ko", "", "Food", "food")).toBe("맛집");
  });
});
