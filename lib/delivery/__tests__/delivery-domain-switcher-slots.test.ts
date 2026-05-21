import { describe, expect, it } from "vitest";
import {
  DELIVERY_DOMAIN_SWITCHER_SLOT_COUNT,
  composeDeliveryDomainSwitcherSlots,
} from "@/lib/delivery/delivery-domain-switcher-slots";

describe("delivery-domain-switcher-slots", () => {
  it("항상 6슬롯", () => {
    expect(DELIVERY_DOMAIN_SWITCHER_SLOT_COUNT).toBe(6);
    expect(composeDeliveryDomainSwitcherSlots(null)).toHaveLength(6);
    expect(composeDeliveryDomainSwitcherSlots("store-1")).toHaveLength(6);
  });

  it("내정보 없음 — 5번째 슬롯만 빈칸(6칸 간격 유지)", () => {
    const slots = composeDeliveryDomainSwitcherSlots("");
    expect(slots.some((s) => s.kind === "action" && s.tab.id === "my")).toBe(false);
    expect(slots[4]).toEqual({ kind: "placeholder", slotId: "delivery-my-reserved" });
    expect(slots[5]).toEqual({ kind: "placeholder", slotId: "delivery-ops-reserved" });
  });

  it("매장주 — 내정보 자리 빈칸, 6번째 운영센터", () => {
    const slots = composeDeliveryDomainSwitcherSlots("abc-store");
    expect(slots[4]).toEqual({ kind: "placeholder", slotId: "delivery-my-reserved" });
    expect(slots[5]).toMatchObject({
      kind: "action",
      tab: { id: "delivery-ops-center" },
      dialIcon: "owner_hub",
    });
    if (slots[5]?.kind === "action") {
      expect(slots[5].tab.href).toContain("storeId=abc-store");
    }
  });
});
