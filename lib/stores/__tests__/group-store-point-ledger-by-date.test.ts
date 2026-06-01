import { describe, expect, it } from "vitest";
import { groupStorePointLedgerByDate } from "@/lib/stores/group-store-point-ledger-by-date";

describe("groupStorePointLedgerByDate", () => {
  it("groups entries by calendar day and sums amounts", () => {
    const groups = groupStorePointLedgerByDate(
      [
        {
          id: "1",
          storeId: "s1",
          storeName: "A",
          entryType: "store_charge",
          amount: 100,
          balanceAfter: 100,
          description: "",
          createdAt: "2026-06-01T10:00:00.000Z",
        },
        {
          id: "2",
          storeId: "s1",
          storeName: "A",
          entryType: "store_order_fee",
          amount: -10,
          balanceAfter: 90,
          description: "",
          createdAt: "2026-06-01T15:00:00.000Z",
        },
        {
          id: "3",
          storeId: "s1",
          storeName: "A",
          entryType: "admin_adjust",
          amount: 50,
          balanceAfter: 140,
          description: "",
          createdAt: "2026-06-02T08:00:00.000Z",
        },
      ],
      "UTC"
    );

    expect(groups.length).toBe(2);
    expect(groups[0].dateKey).toBe("2026-06-02");
    expect(groups[0].totalAmount).toBe(50);
    expect(groups[1].dateKey).toBe("2026-06-01");
    expect(groups[1].totalAmount).toBe(90);
  });
});
