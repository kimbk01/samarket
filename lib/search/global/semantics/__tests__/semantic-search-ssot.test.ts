import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertMatchHighlightInvariant,
  buildMatchedSnippet,
  matchGlobalSearchRecord,
  matchGlobalSearchText,
} from "@/lib/search/global/semantics/match";
import { buildSearchHighlightSegments } from "@/lib/search/global/semantics/highlight";
import { isIsolatedHangulJamoQuery, isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { normalizeGlobalSearchText } from "@/lib/search/global/semantics/normalize";
import {
  clearGlobalSearchEntryDomain,
  orderGlobalSearchDomains,
  readGlobalSearchEntryDomain,
} from "@/lib/search/global/semantics/entry-domain";
import {
  matchChatGlobalSearch,
  matchCommunityGlobalSearch,
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
  matchTradeGlobalSearch,
  communityGlobalSearchFeedPreview,
} from "@/lib/search/global/semantics/domain-fields";
import {
  closeGlobalSearch,
  openGlobalSearchFromHere,
} from "@/lib/search/global/global-search-navigation-ssot";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("K1–K7 Korean semantic contract", () => {
  it("K1 김치 ⊂ 김치찌개", () => {
    expect(isSearchableGlobalQuery("김치")).toBe(true);
    expect(matchGlobalSearchText("김치찌개", "김치")).toBe(true);
    expect(matchCommunityGlobalSearch({ title: "김치찌개 후기" }, "김치").matched).toBe(true);
  });

  it("community keyword feed preview exposes later-body 김치 for highlight", () => {
    const title = "세부샹그릴라 신혼여행 후기";
    const opening = "세부샹그릴라 리조트에서 보낸 신혼여행 일정과 객실, 조식, 수영장 풍경을 정리했습니다. ";
    const later = "마지막 저녁은 돼지고기 김치찌개를 먹었습니다.";
    const fallback = opening.slice(0, 160);
    expect(fallback.includes("김치")).toBe(false);
    const truncatedMatch = matchCommunityGlobalSearch(
      { title, content: fallback, summary: fallback },
      "김치"
    );
    expect(truncatedMatch.matched).toBe(false);
    const preview = communityGlobalSearchFeedPreview(
      { title, content: opening + later, summary: opening },
      "김치",
      fallback
    );
    expect(preview.content).toContain("김치");
    expect(preview.summary).toContain("김치");
    const dtoMatch = matchCommunityGlobalSearch(
      { title, content: preview.content, summary: preview.summary },
      "김치"
    );
    expect(dtoMatch.matched).toBe(true);
    expect(dtoMatch.matchedField).not.toBe("NONE");
    expect(buildSearchHighlightSegments(preview.content, "김치").some((s) => s.matched)).toBe(true);
  });

  it("K2 김치 vs 김밥과 치킨 is not a match", () => {
    expect(matchGlobalSearchText("김밥과 치킨", "김치")).toBe(false);
    expect(matchCommunityGlobalSearch({ title: "김밥과 치킨" }, "김치").matched).toBe(false);
  });

  it("K3 ㄱ does not execute", () => {
    expect(isIsolatedHangulJamoQuery("ㄱ")).toBe(true);
    expect(isSearchableGlobalQuery("ㄱ")).toBe(false);
    expect(matchGlobalSearchText("김치찌개", "ㄱ")).toBe(false);
  });

  it("K4 ㄱㅣㅁ does not execute", () => {
    expect(isSearchableGlobalQuery("ㄱㅣㅁ")).toBe(false);
    expect(isSearchableGlobalQuery("ㄱㅊ")).toBe(false);
  });

  it("K5 NFC query matches NFD stored text", () => {
    const nfc = "김치찌개";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(matchGlobalSearchText(nfd, "김치".normalize("NFC"))).toBe(true);
    expect(matchGlobalSearchText(nfc, "김치".normalize("NFD"))).toBe(true);
  });

  it("K6 scattered 김 + 치 is not 김치", () => {
    expect(matchGlobalSearchText("김밥과 치킨", "김치")).toBe(false);
    expect(isSearchableGlobalQuery("김 치")).toBe(false);
  });

  it("K7 one-syllable Hangul does not explode", () => {
    expect(isSearchableGlobalQuery("치")).toBe(false);
    expect(matchCommunityGlobalSearch({ title: "김치찌개", content: "치킨", summary: "김치" }, "치").matched).toBe(
      false
    );
  });
});

describe("E1–E8 Latin semantic contract", () => {
  const hay = "팝니다 Toyota Wigo";

  it("E1 Wigo → Toyota Wigo", () => {
    expect(matchGlobalSearchText(hay, "Wigo")).toBe(true);
    expect(matchTradeGlobalSearch(hay, "Wigo").matchedField).toBe("title");
  });

  it("E2 wigo → Toyota Wigo", () => {
    expect(matchGlobalSearchText(hay, "wigo")).toBe(true);
  });

  it("E3 WIGO → Toyota Wigo", () => {
    expect(matchGlobalSearchText(hay, "WIGO")).toBe(true);
  });

  it("E4 wig prefix → Wigo", () => {
    expect(isSearchableGlobalQuery("wig")).toBe(true);
    expect(matchGlobalSearchText(hay, "wig")).toBe(true);
  });

  it("E5 go does not match Wigo and does not execute", () => {
    expect(isSearchableGlobalQuery("go")).toBe(false);
    expect(matchGlobalSearchText(hay, "go")).toBe(false);
    expect(matchTradeGlobalSearch("Toyota Wigo", "go").matched).toBe(false);
  });

  it("E6 Toyota Wigo exact phrase in one field", () => {
    expect(matchGlobalSearchText(hay, "Toyota Wigo")).toBe(true);
  });

  it("E7 all tokens on the same record", () => {
    const rec = matchGlobalSearchRecord(
      { title: "Toyota Fortuner", content: "Wigo spare" },
      ["title", "content"] as const,
      "Toyota Wigo"
    );
    expect(rec.matched).toBe(true);
    expect(rec.matchedField).not.toBe("NONE");
  });

  it("E8 OR-union across records is forbidden", () => {
    expect(matchTradeGlobalSearch("Toyota Fortuner", "Toyota Wigo").matched).toBe(false);
    expect(matchTradeGlobalSearch("Honda Wigo", "Toyota Wigo").matched).toBe(false);
  });
});

describe("H1–H7 highlight", () => {
  it("H1 Korean phrase segments", () => {
    const segs = buildSearchHighlightSegments("김치찌개", "김치");
    expect(segs.some((s) => s.matched && s.text === "김치")).toBe(true);
    expect(assertMatchHighlightInvariant("김치찌개", "김치", true)).toBe(true);
  });

  it("H2 Latin case-insensitive", () => {
    const segs = buildSearchHighlightSegments("Toyota Wigo", "wigo");
    expect(segs).toEqual([
      { text: "Toyota ", matched: false },
      { text: "Wigo", matched: true },
    ]);
  });

  it("H3 multiple occurrence", () => {
    const segs = buildSearchHighlightSegments("김치 그리고 김치찌개", "김치");
    expect(segs.filter((s) => s.matched).length).toBeGreaterThanOrEqual(2);
  });

  it("H4 no-match has no fake highlight", () => {
    const segs = buildSearchHighlightSegments("분식 모임", "김치");
    expect(segs.every((s) => !s.matched)).toBe(true);
    expect(assertMatchHighlightInvariant("분식 모임", "김치", false)).toBe(true);
  });

  it("H5 NFC/NFD highlight", () => {
    const segs = buildSearchHighlightSegments("김치찌개".normalize("NFD"), "김치");
    expect(segs.some((s) => s.matched)).toBe(true);
  });

  it("H6 matched field === highlighted field", () => {
    const match = matchCommunityGlobalSearch(
      { title: "분식", content: "오늘 김치찌개", summary: "" },
      "김치"
    );
    expect(match.matchedField).toBe("content");
    const snippet = buildMatchedSnippet("오늘 김치찌개", "김치");
    expect(buildSearchHighlightSegments(snippet, "김치").some((s) => s.matched)).toBe(true);
  });

  it("H7 rejected inner substring has no highlight", () => {
    expect(buildSearchHighlightSegments("Toyota Wigo", "go").every((s) => !s.matched)).toBe(true);
    expect(assertMatchHighlightInvariant("Toyota Wigo", "go", false)).toBe(true);
  });
});

describe("I1–I6 entry domain order is priority not filter", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", { location: { pathname: "/stores/browse", search: "", hash: "" } });
  });

  afterEach(() => {
    clearGlobalSearchEntryDomain();
    vi.unstubAllGlobals();
  });

  it("I1 Community first", () => {
    expect(orderGlobalSearchDomains("community")).toEqual(["community", "trade", "delivery", "chat"]);
  });

  it("I2 Trade first", () => {
    expect(orderGlobalSearchDomains("trade")).toEqual(["trade", "community", "delivery", "chat"]);
  });

  it("I3 Delivery first", () => {
    expect(orderGlobalSearchDomains("delivery")).toEqual(["delivery", "community", "trade", "chat"]);
  });

  it("I4 Chat first", () => {
    expect(orderGlobalSearchDomains("chat")).toEqual(["chat", "community", "trade", "delivery"]);
  });

  it("I5 direct /search canonical default", () => {
    expect(orderGlobalSearchDomains(null)).toEqual(["community", "trade", "delivery", "chat"]);
  });

  it("I6 entry priority does not change the match set", () => {
    const q = "김치";
    const communityHit = matchCommunityGlobalSearch({ title: "김치찌개" }, q).matched;
    const tradeHit = matchTradeGlobalSearch("김치냉장고", q).matched;
    expect(communityHit).toBe(true);
    expect(tradeHit).toBe(true);
    for (const entry of ["community", "trade", "delivery", "chat", null] as const) {
      expect(matchCommunityGlobalSearch({ title: "김치찌개" }, q).matched).toBe(communityHit);
      expect(matchTradeGlobalSearch("김치냉장고", q).matched).toBe(tradeHit);
      expect(orderGlobalSearchDomains(entry).sort()).toEqual(
        ["chat", "community", "delivery", "trade"]
      );
    }
  });

  it("open stores domain intent in session, close clears it, never ?from=", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    openGlobalSearchFromHere(router, { domain: "delivery" });
    expect(readGlobalSearchEntryDomain()).toBe("delivery");
    closeGlobalSearch(router);
    expect(readGlobalSearchEntryDomain()).toBeNull();
    const ssot = read("lib/search/global/global-search-navigation-ssot.ts");
    const domain = read("lib/search/global/semantics/entry-domain.ts");
    expect(ssot).not.toMatch(/\?from=/);
    expect(ssot).toContain("writeGlobalSearchEntryDomain");
    expect(domain).toContain("dibay_global_search_entry_domain_v1");
  });
});

describe("normalization SSOT", () => {
  it("NFC trim collapse whitespace Latin case-fold, no NFKC rewrite of input", () => {
    expect(normalizeGlobalSearchText("  Toyota   WIGO  ")).toBe("toyota wigo");
    expect(normalizeGlobalSearchText("김치".normalize("NFD"))).toBe("김치");
    const src = read("lib/search/global/semantics/normalize.ts");
    expect(src).toContain('normalize("NFC")');
    expect(src).toContain("NFKC is forbidden");
    expect(src).not.toMatch(/normalize\("NFKC"\)/);
  });
});
