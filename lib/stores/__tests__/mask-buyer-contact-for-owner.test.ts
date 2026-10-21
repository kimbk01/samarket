import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OWNER_BUYER_CONTACT_RETENTION_DAYS,
  isOwnerBuyerContactExpired,
  maskBuyerContactForOwner,
  maskPhoneKeepLast4,
} from "@/lib/stores/mask-buyer-contact-for-owner";

const NOW = new Date("2026-10-21T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const base = {
  id: "o1",
  buyer_phone: "+639171234567",
  delivery_address_summary: "Makati",
  delivery_address_detail: "Unit 5B",
  delivery_detail_address: "Unit 5B",
  delivery_formatted_address: "1 Ayala Ave, Makati",
  delivery_latitude: 14.55,
  delivery_longitude: 121.02,
};

describe("LOC-008 owner buyer contact masking (D-15 = 30 days)", () => {
  it("retention is 30 days", () => {
    expect(OWNER_BUYER_CONTACT_RETENTION_DAYS).toBe(30);
  });

  it.each([
    ["completed", 31, true],
    ["completed", 29, false],
    ["cancelled", 31, true],
    ["cancelled", 30, false],
    ["accepted", 400, false],
    ["delivering", 400, false],
    ["pending", 400, false],
  ])("status=%s ended %i days ago → masked=%s", (status, days, masked) => {
    const row = { ...base, order_status: status, updated_at: daysAgo(days as number) };
    expect(isOwnerBuyerContactExpired(row, NOW)).toBe(masked);
    const out = maskBuyerContactForOwner(row, NOW);
    if (masked) {
      expect(out.buyer_phone).toBe("+********4567");
      expect(out.delivery_address_detail).toBeNull();
      expect(out.delivery_detail_address).toBeNull();
      expect(out.delivery_latitude).toBeNull();
      expect(out.delivery_longitude).toBeNull();
      expect(out.buyer_contact_masked).toBe(true);
      // summary-level address stays
      expect(out.delivery_address_summary).toBe("Makati");
      expect(out.delivery_formatted_address).toBe("1 Ayala Ave, Makati");
    } else {
      expect(out).toBe(row);
    }
  });

  it("refunded uses refunded_at (not later updated_at)", () => {
    const row = { ...base, order_status: "refunded", refunded_at: daysAgo(40), updated_at: daysAgo(5) };
    expect(isOwnerBuyerContactExpired(row, NOW)).toBe(true);
    const recent = { ...row, refunded_at: daysAgo(10) };
    expect(isOwnerBuyerContactExpired(recent, NOW)).toBe(false);
  });

  it("missing end time → not masked; keys absent on list rows are not added", () => {
    expect(isOwnerBuyerContactExpired({ order_status: "completed" }, NOW)).toBe(false);
    const listRow = { id: "o2", order_status: "completed", updated_at: daysAgo(60), buyer_phone: "0917 123 4567" };
    const out = maskBuyerContactForOwner(listRow, NOW);
    expect(out.buyer_phone).toBe("**** *** 4567");
    expect("delivery_latitude" in out).toBe(false);
  });

  it("does not mutate the stored row object", () => {
    const row = { ...base, order_status: "completed", updated_at: daysAgo(90) };
    maskBuyerContactForOwner(row, NOW);
    expect(row.buyer_phone).toBe("+639171234567");
    expect(row.delivery_latitude).toBe(14.55);
  });

  it("maskPhoneKeepLast4 keeps short numbers", () => {
    expect(maskPhoneKeepLast4("1234")).toBe("1234");
  });

  it("owner detail + list routes apply the mask; admin detail is not masked", () => {
    const detail = readFileSync(
      join(process.cwd(), "app/api/me/stores/[storeId]/orders/[orderId]/route.ts"),
      "utf8"
    );
    expect(detail.match(/maskBuyerContactForOwner\(/g)?.length).toBe(2);
    const list = readFileSync(join(process.cwd(), "app/api/me/stores/[storeId]/orders/route.ts"), "utf8");
    expect(list.match(/maskBuyerContactForOwner\(o\)/g)?.length).toBe(2);
    const admin = readFileSync(join(process.cwd(), "lib/admin/store-orders/load-admin-store-order-detail.ts"), "utf8");
    expect(admin).not.toContain("maskBuyerContactForOwner");
  });
});
