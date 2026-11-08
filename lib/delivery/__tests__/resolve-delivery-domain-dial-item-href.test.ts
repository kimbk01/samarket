import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { composeDeliveryDomainSwitcherSlots } from "@/lib/delivery/delivery-domain-switcher-slots";
import { resolveDeliveryDomainDialItemHref } from "@/lib/delivery/resolve-delivery-domain-dial-item-href";

function dialActionTab(id: string) {
  const slots = composeDeliveryDomainSwitcherSlots("");
  const hit = slots.find((s) => s.kind === "action" && s.tab.id === id);
  if (!hit || hit.kind !== "action") {
    throw new Error(`missing dial action tab: ${id}`);
  }
  return hit.tab;
}

describe("resolveDeliveryDomainDialItemHref", () => {
  it("배달 칩은 항상 /stores", () => {
    expect(resolveDeliveryDomainDialItemHref(dialActionTab("stores"))).toBe("/stores");
    const raw = BOTTOM_NAV_ITEMS.find((t) => t.id === "stores")!;
    expect(raw.href).toBe("/stores");
  });

  it("홈·커뮤니티·메신저 칩 href (2026-11-09 — home = 앱 홈)", () => {
    expect(resolveDeliveryDomainDialItemHref(dialActionTab("home"))).toBe("/home");
    expect(resolveDeliveryDomainDialItemHref(dialActionTab("community"))).toBe("/philife");
    expect(resolveDeliveryDomainDialItemHref(dialActionTab("chat"))).toBe(
      "/community-messenger/delivery-chats?from=delivery"
    );
    expect(resolveDeliveryDomainDialItemHref(dialActionTab("chat"), "trade")).toBe(
      "/community-messenger/trade-chats?from=trade"
    );
  });

  it("매장주 운영센터 — OwnerRoutes.hub", () => {
    const slots = composeDeliveryDomainSwitcherSlots("store-abc");
    const ops = slots.find((s) => s.kind === "action" && s.tab.id === "delivery-ops-center");
    expect(ops?.kind).toBe("action");
    if (ops?.kind !== "action") return;
    expect(resolveDeliveryDomainDialItemHref(ops.tab)).toBe(ops.tab.href);
    expect(ops.tab.href).toContain("store-abc");
  });
});
