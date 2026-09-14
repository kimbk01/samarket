import { describe, expect, it } from "vitest";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";

describe("manilaseoul section truth live", () => {
  it("PDF월간 discovers zero board_monthly articles; catalog stays 확인 필요", async () => {
    const monthly = resolveExternalBoardAdapter(
      "http://manilaseoul.co.kr/bbs_list.php?tb=board_monthly"
    );
    const monthlyItems = await monthly.adapter!.discoverArticles(monthly.ctx, {
      limit: 5,
      pageFrom: 1,
      pageTo: 1,
    });
    expect(monthlyItems.length).toBe(0);
    expect(findCatalogSection("ms-monthly")?.section.status).toBe("needs_check");
  }, 60_000);

  it("독자투고 list exists but document quality not proven → catalog 확인 필요", async () => {
    const reader = resolveExternalBoardAdapter(
      "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader"
    );
    const readerItems = await reader.adapter!.discoverArticles(reader.ctx, {
      limit: 3,
      pageFrom: 1,
      pageTo: 1,
    });
    const withDocs = readerItems.filter((i) => (i.sampleDocument?.nodes?.length ?? 0) > 0);
    // Either empty discover or empty documents — not product-ready.
    expect(withDocs.length).toBe(0);
    expect(findCatalogSection("ms-reader")?.section.status).toBe("needs_check");
    expect(findCatalogSection("ms-free")).toBeNull();
  }, 60_000);
});
