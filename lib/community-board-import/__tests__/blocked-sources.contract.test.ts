/**
 * Contract tests for board_import Wikivoyage contamination block.
 */
import { describe, expect, it } from "vitest";
import {
  BOARD_IMPORT_BLOCKED_SOURCE_IDS,
  isBoardImportSourceBlocked,
} from "@/lib/community-board-import/blocked-sources";

describe("board-import blocked proven contamination source", () => {
  it("blocks proven Wikivoyage source id", () => {
    expect(BOARD_IMPORT_BLOCKED_SOURCE_IDS.has("53b6b238-74c9-49b3-92fe-78d703faca4f")).toBe(true);
    expect(
      isBoardImportSourceBlocked({ id: "53b6b238-74c9-49b3-92fe-78d703faca4f" })
    ).toBe(true);
  });

  it("blocks wikivoyage host/url even if id differs", () => {
    expect(
      isBoardImportSourceBlocked({
        id: "other",
        sourceUrl: "https://en.wikivoyage.org/wiki/Category:Philippines",
      })
    ).toBe(true);
    expect(isBoardImportSourceBlocked({ siteKey: "en.wikivoyage.org" })).toBe(true);
  });

  it("does not block unrelated sources", () => {
    expect(
      isBoardImportSourceBlocked({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        siteKey: "manilaseoul.co.kr",
        sourceUrl: "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader",
      })
    ).toBe(false);
  });
});
