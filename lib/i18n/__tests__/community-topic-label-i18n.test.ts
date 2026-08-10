import { describe, expect, it } from "vitest";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

describe("resolveCommunityTopicUILabel — Community Topic display authority", () => {
  it("EN: uses Admin name when name_en is null (not slug humanize)", () => {
    expect(
      resolveCommunityTopicUILabel("en", "QA IA msmp0i3x2", null, "qa-ia-msmp0i3x")
    ).toBe("QA IA msmp0i3x2");
  });

  it("EN: prefers name_en over Admin name", () => {
    expect(
      resolveCommunityTopicUILabel("en", "기본 이름", "English Name", "topic")
    ).toBe("English Name");
  });

  it("EN: falls back to slug humanize when name and name_en empty", () => {
    const label = resolveCommunityTopicUILabel("en", "", null, "philippines-news");
    expect(label.length).toBeGreaterThan(0);
    expect(label.toLowerCase()).not.toBe("philippines-news");
    expect(label).toMatch(/Philippines/i);
  });

  it("KO: keeps Admin name when present", () => {
    expect(
      resolveCommunityTopicUILabel("ko", "QA IA msmp0i3x2", null, "qa-ia-msmp0i3x")
    ).toBe("QA IA msmp0i3x2");
  });

  it("KO: uses name_en when Admin name empty", () => {
    expect(
      resolveCommunityTopicUILabel("ko", "", "English Name", "topic")
    ).toBe("English Name");
  });
});
