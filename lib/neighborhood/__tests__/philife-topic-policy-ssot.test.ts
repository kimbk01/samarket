import { describe, expect, it } from "vitest";
import {
  isPhilifeNeighborhoodSortSlotSlug,
  isPhilifeNeighborhoodWriteEligibleRow,
} from "@/lib/neighborhood/philife-topic-slug-rules";

describe("philife topic policy — content write SSOT", () => {
  it("normal content topics are write-eligible", () => {
    for (const slug of ["phlifee", "travel", "dailylife", "question", "news", "qa-ia-msmpwnr8"]) {
      expect(isPhilifeNeighborhoodWriteEligibleRow(false, slug)).toBe(true);
      expect(isPhilifeNeighborhoodWriteEligibleRow(true, slug)).toBe(true);
    }
  });

  it("excludes sort-slot seed slugs from general write", () => {
    for (const slug of ["popular", "recommend", "recommended"]) {
      expect(isPhilifeNeighborhoodSortSlotSlug(slug)).toBe(true);
      expect(isPhilifeNeighborhoodWriteEligibleRow(false, slug)).toBe(false);
    }
  });
});
