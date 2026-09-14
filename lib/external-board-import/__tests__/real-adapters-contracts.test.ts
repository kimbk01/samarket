import { describe, expect, it } from "vitest";
import { listExternalBoardAdapters, resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import { extractOrderedNodesFromHtmlRoot } from "@/lib/external-board-import/extraction/ordered-from-html";
import {
  normalizeDiscoverOpts,
  normalizeExternalBoardDateBounds,
  withinDateRange,
} from "@/lib/external-board-import/extraction/discover-opts";

describe("external-board real adapter registry", () => {
  it("registers real host adapters besides fixture", () => {
    const ids = listExternalBoardAdapters().map((a) => a.id);
    expect(ids).toContain("fixture");
    expect(ids).toContain("manilaseoul-static-bbs");
    expect(ids).toContain("pinoy-forum-flarum");
    expect(ids).toContain("philsamo-gnuboard");
    expect(ids).toContain("hellocebuph-wordpress");
  });

  it("resolves manilaseoul list board only when tb is explicit", () => {
    const withTb = resolveExternalBoardAdapter(
      "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader"
    );
    expect(withTb.adapter?.id).toBe("manilaseoul-static-bbs");
    const noTb = resolveExternalBoardAdapter("http://manilaseoul.co.kr/");
    expect(noTb.adapter).toBeNull();
  });

  it("resolves pinoy.forum", () => {
    const { adapter } = resolveExternalBoardAdapter("https://pinoy.forum/");
    expect(adapter?.id).toBe("pinoy-forum-flarum");
  });

  it("resolves philsamo news board", () => {
    const { adapter } = resolveExternalBoardAdapter(
      "https://philsamo.com/bbs/board.php?bo_table=news"
    );
    expect(adapter?.id).toBe("philsamo-gnuboard");
  });

  it("resolves hellocebuph", () => {
    const { adapter } = resolveExternalBoardAdapter("https://hellocebuph.com/");
    expect(adapter?.id).toBe("hellocebuph-wordpress");
  });
});

describe("ordered HTML extraction", () => {
  it("preserves paragraph/image/paragraph order", () => {
    const html = `<div id="ct"><p>P1</p><p><img src="/a.jpg" alt="A" /></p><p>P2</p><p><img src="/b.jpg" /></p><p>P3</p></div>`;
    const nodes = extractOrderedNodesFromHtmlRoot(html, "https://example.com/", "#ct");
    expect(nodes.map((n) => n.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
      "image",
      "paragraph",
    ]);
    expect(nodes[0]).toMatchObject({ type: "paragraph", text: "P1" });
    expect(nodes[1]).toMatchObject({ type: "image", src: "https://example.com/a.jpg" });
    expect(nodes[2]).toMatchObject({ type: "paragraph", text: "P2" });
  });
});

describe("source date parse", () => {
  it("parses dated without inventing local TZ offset labels", () => {
    expect(parseExternalBoardSourceDate("2026-09-10")).toBe("2026-09-10T00:00:00.000Z");
    expect(parseExternalBoardSourceDate("2022-05-26 08:11:57")).toBe("2022-05-26T08:11:57.000Z");
    expect(parseExternalBoardSourceDate("not a date")).toBeNull();
  });
});

describe("discover opts", () => {
  it("clamps page/limit safely", () => {
    const n = normalizeDiscoverOpts({ limit: 999, pageFrom: 2, pageTo: 50 });
    expect(n.limit).toBe(50);
    expect(n.pageFrom).toBe(2);
    expect(n.pageTo).toBeLessThanOrEqual(21);
  });

  it("Admin YYYY-MM-DD dateTo is inclusive end-of-day via half-open UTC", () => {
    const n = normalizeDiscoverOpts({ dateFrom: "2022-05-21", dateTo: "2022-05-25" });
    expect(n.dateFrom).toBe("2022-05-21T00:00:00.000Z");
    expect(n.dateTo).toBe("2022-05-26T00:00:00.000Z");
    expect(n.dateRangeMeta.inputKind).toEqual({ from: "date_only", to: "date_only" });
    expect(withinDateRange("2022-05-25T08:11:57.000Z", n.dateFrom, n.dateTo)).toBe(true);
    expect(withinDateRange("2022-05-25T23:59:59.999Z", n.dateFrom, n.dateTo)).toBe(true);
    expect(withinDateRange("2022-05-26T00:00:00.000Z", n.dateFrom, n.dateTo)).toBe(false);
    expect(withinDateRange("2022-05-20T23:59:59.999Z", n.dateFrom, n.dateTo)).toBe(false);
    expect(withinDateRange(null, n.dateFrom, n.dateTo)).toBe(false);
  });

  it("normalizeExternalBoardDateBounds matches Admin calendar-day contract", () => {
    const b = normalizeExternalBoardDateBounds("2022-05-21", "2022-05-25");
    expect(b.dateFromInclusive).toBe("2022-05-21T00:00:00.000Z");
    expect(b.dateToExclusive).toBe("2022-05-26T00:00:00.000Z");
  });
});
