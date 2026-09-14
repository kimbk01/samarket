import { describe, expect, it } from "vitest";
import {
  PHILIPPINES_SOURCE_CATALOG,
  TOPIC_GROUP_ORDER,
  catalogCapabilityLabel,
  filterCatalogByTopicGroup,
} from "@/lib/external-board-import/catalog/source-catalog";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

describe("philippines source catalog", () => {
  it("exposes all topic groups and never marks adapter-less as available", () => {
    expect(TOPIC_GROUP_ORDER).toContain("travel");
    expect(TOPIC_GROUP_ORDER).toContain("expat");
    for (const src of PHILIPPINES_SOURCE_CATALOG) {
      for (const sec of src.sections) {
        if (sec.status === "available") {
          expect(sec.sectionUrl).toBeTruthy();
          expect(sec.adapterId).toBeTruthy();
        }
      }
    }
  });

  it("Wikivoyage is disabled; DOT Central Visayas is available; manilaseoul board_free never in catalog", () => {
    const wiki = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "wikivoyage");
    expect(wiki?.sections.every((s) => s.status === "disabled")).toBe(true);
    const dot = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "dot");
    const cv = dot?.sections.find((s) => s.sectionId === "dot-central-visayas");
    expect(cv?.status).toBe("available");
    expect(catalogCapabilityLabel("needs_check")).toBe("확인 필요");
    const ms = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "manilaseoul");
    expect(ms?.sections.some((s) => s.sectionId === "ms-free")).toBe(false);
    expect(ms?.sections.some((s) => /자유게시판|board_free/i.test(s.sectionName + (s.sectionUrl || "")))).toBe(
      false
    );
  });

  it("travel filter includes DOT; expat includes manilaseoul", () => {
    const travel = filterCatalogByTopicGroup("travel");
    expect(travel.some((s) => s.sourceId === "dot")).toBe(true);
    const expat = filterCatalogByTopicGroup("expat");
    expect(expat.some((s) => s.sourceId === "manilaseoul")).toBe(true);
  });

  it("available catalog URLs resolve to an adapter", () => {
    for (const src of PHILIPPINES_SOURCE_CATALOG) {
      for (const sec of src.sections) {
        if (sec.status !== "available" || !sec.sectionUrl) continue;
        const { adapter } = resolveExternalBoardAdapter(sec.sectionUrl);
        expect(adapter?.id).toBe(sec.adapterId);
      }
    }
  });
});
