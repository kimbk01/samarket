import { describe, expect, it } from "vitest";
import {
  isPhilifeGeneralOnlyTopicSlug,
  isPhilifeNeighborhoodSortSlotSlug,
  isPhilifeNeighborhoodWriteEligibleRow,
  PHILIFE_GENERAL_ONLY_TOPIC_SLUGS,
  qualifiesForPhilifeMeetupWriterTopic,
} from "@/lib/neighborhood/philife-topic-slug-rules";

describe("philife topic policy — content write SSOT", () => {
  it("normal content topics are write-eligible without GENERAL_ONLY membership", () => {
    for (const slug of ["phlifee", "travel", "dailylife", "question", "news", "qa-ia-msmpwnr8"]) {
      expect(isPhilifeNeighborhoodWriteEligibleRow(false, false, slug)).toBe(true);
      expect(isPhilifeNeighborhoodWriteEligibleRow(false, true, slug)).toBe(true);
    }
    expect(PHILIFE_GENERAL_ONLY_TOPIC_SLUGS.has("phlifee")).toBe(false);
    expect(PHILIFE_GENERAL_ONLY_TOPIC_SLUGS.has("travel")).toBe(false);
    expect(PHILIFE_GENERAL_ONLY_TOPIC_SLUGS.has("dailylife")).toBe(false);
  });

  it("does not use GENERAL_ONLY as content write allowlist when allow_meetup=true", () => {
    expect(isPhilifeGeneralOnlyTopicSlug("question")).toBe(true);
    expect(isPhilifeNeighborhoodWriteEligibleRow(true, false, "question")).toBe(false);
    expect(isPhilifeNeighborhoodWriteEligibleRow(true, false, "custom-meetup")).toBe(false);
  });

  it("excludes sort-slot seed slugs from general write", () => {
    for (const slug of ["popular", "recommend", "recommended"]) {
      expect(isPhilifeNeighborhoodSortSlotSlug(slug)).toBe(true);
      expect(isPhilifeNeighborhoodWriteEligibleRow(false, false, slug)).toBe(false);
    }
  });

  it("keeps GENERAL_ONLY only as meetup misconfig guard", () => {
    expect(qualifiesForPhilifeMeetupWriterTopic(true, "question")).toBe(false);
    expect(qualifiesForPhilifeMeetupWriterTopic(true, "hiking-club")).toBe(true);
    expect(qualifiesForPhilifeMeetupWriterTopic(false, "hiking-club")).toBe(false);
  });
});
