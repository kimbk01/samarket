import { describe, expect, it } from "vitest";
import { reconcileTradeRowsWithVisibility } from "@/lib/trade/marketplace/trade-list-visibility-reconcile";

type Row = { id: string; status?: string | null; seller_listing_state?: string | null; title: string };

const rows: Row[] = [
  { id: "a", status: "active", seller_listing_state: "inquiry", title: "A" },
  { id: "b", status: "sold", seller_listing_state: "completed", title: "B" },
  { id: "c", status: "active", seller_listing_state: "inquiry", title: "C" },
  { id: "d", status: "active", seller_listing_state: "inquiry", title: "D" },
];

describe("reconcileTradeRowsWithVisibility (LIST-01)", () => {
  it("drops hidden and deleted rows, keeps order, patches status", () => {
    const out = reconcileTradeRowsWithVisibility(
      rows,
      [
        { id: "a", status: "active", seller_listing_state: "inquiry" },
        { id: "b", status: "hidden", seller_listing_state: "completed" },
        { id: "c", status: "sold", seller_listing_state: "completed" },
      ],
      ["a", "b", "c", "d"]
    );
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
    expect(out[1]).toMatchObject({ id: "c", status: "sold", seller_listing_state: "completed", title: "C" });
  });

  it("does not touch rows that were not checked (e.g. beyond the id cap)", () => {
    const out = reconcileTradeRowsWithVisibility(rows, [], ["a"]);
    expect(out.map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("returns the same array when nothing changed (no re-render)", () => {
    const out = reconcileTradeRowsWithVisibility(
      rows,
      rows.map((r) => ({ id: r.id, status: r.status ?? null, seller_listing_state: r.seller_listing_state ?? null })),
      rows.map((r) => r.id)
    );
    expect(out).toBe(rows);
  });
});
