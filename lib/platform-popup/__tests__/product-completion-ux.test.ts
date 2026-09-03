/**
 * Product completion — CTA destination UX + surface radio + suppression mapping + Admin nav.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodePlatformPopupOwnerCtaDestination,
  encodePlatformPopupOwnerCtaDestination,
  describePlatformPopupCtaDestination,
} from "@/lib/platform-popup/popup-cta-destination-ux";
import { surfacesFromAdminTargetMode } from "@/lib/platform-popup/admin-surface-target-mode";
import { resolvePlatformPopupSuppressionUxMapping } from "@/lib/platform-popup/popup-suppression-ux-contract";
import { normalizePlatformPopupCta } from "@/lib/platform-popup/cta";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { adminMenu } from "@/components/admin/admin-menu";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("platform popup product completion — CTA SSOT", () => {
  it("encodes store/menu/promotion to canonical CTA storage", () => {
    const store = encodePlatformPopupOwnerCtaDestination({
      kind: "store",
      storeId: "s1",
    });
    expect(store.ok).toBe(true);
    if (store.ok) {
      expect(store.value.ctaType).toBe("store");
      expect(store.value.href).toBe("/stores/s1");
    }

    const menu = encodePlatformPopupOwnerCtaDestination({
      kind: "menu",
      storeId: "s1",
    });
    expect(menu.ok).toBe(true);
    if (menu.ok) {
      expect(menu.value.ctaType).toBe("internal_page");
      expect(menu.value.href).toContain("#menu");
      expect(normalizePlatformPopupCta(menu.value).ok).toBe(true);
    }

    const promo = encodePlatformPopupOwnerCtaDestination({
      kind: "promotion",
      storeId: "s1",
    });
    expect(promo.ok).toBe(true);
    if (promo.ok) {
      expect(promo.value.href).toContain("tab=promo");
    }
  });

  it("round-trips decode for owner destinations", () => {
    expect(
      decodePlatformPopupOwnerCtaDestination({
        ctaType: "store",
        ctaTarget: "s1",
        storeId: "s1",
      })
    ).toBe("store");
    expect(
      decodePlatformPopupOwnerCtaDestination({
        ctaType: "internal_page",
        ctaTarget: "/stores/s1#menu",
        storeId: "s1",
      })
    ).toBe("menu");
    expect(
      decodePlatformPopupOwnerCtaDestination({
        ctaType: "internal_page",
        ctaTarget: "/stores/s1?tab=promo",
        storeId: "s1",
      })
    ).toBe("promotion");
  });

  it("describes CTA without UUID-only primary copy", () => {
    const d = describePlatformPopupCtaDestination({
      ctaType: "store",
      ctaTarget: "uuid-store",
      storeId: "uuid-store",
      storeName: "Cafe Demo",
      lang: "ko",
    });
    expect(d.readable).toContain("Cafe Demo");
    expect(d.readable).not.toBe("uuid-store");
  });
});

describe("platform popup product completion — surface + suppression", () => {
  it("Owner/Admin surface radio maps to single-row surfaces", () => {
    expect(surfacesFromAdminTargetMode("GLOBAL")).toEqual(["GLOBAL"]);
    expect(surfacesFromAdminTargetMode("TRADE")).toEqual(["TRADE"]);
  });

  it("CLOSE != SESSION in UX mapping", () => {
    const m = resolvePlatformPopupSuppressionUxMapping({
      suppressionMode: "TODAY",
      suppressionDurationSeconds: null,
    });
    expect(m.closeEqualsSession).toBe(false);
    expect(m.closePersists).toBe(false);
    expect(m.todayCalendar).toBe("Asia/Manila_local_day_end");
    expect(m.userFacingButtons).toContain("TODAY");
  });
});

describe("platform popup product completion — Admin IA", () => {
  it("nav leaf exists under ads with discoverable path", () => {
    const leaf = findAdminMenuByKey(adminMenu, "ads-platform-popup");
    expect(leaf?.path).toBe("/admin/platform-popup");
    expect(leaf?.status).toBe("done");
    const ads = findAdminMenuByKey(adminMenu, "ads");
    expect(ads?.children?.[0]?.key).toBe("ads-platform-popup");
  });

  it("hub page uses Control Center (not raw queue-only)", () => {
    const page = readRepo("app/admin/platform-popup/page.tsx");
    expect(page).toContain("AdminPlatformPopupHubPage");
    const hub = readRepo("components/admin/platform-popup/AdminPlatformPopupHubPage.tsx");
    expect(hub).toContain("data-admin-platform-popup-hub");
    expect(hub).toContain("data-hub-tab=\"requests\"");
    expect(hub).toContain("data-hub-tab=\"campaigns\"");
    expect(hub).toContain("data-admin-popup-direct-create");
  });

  it("Owner apply uses surface radio + CTA kinds + requestId recovery", () => {
    const apply = readRepo("components/business/owner/ads/OwnerPlatformPopupApplyView.tsx");
    expect(apply).toContain("data-owner-popup-surface-radio");
    expect(apply).toContain("data-owner-popup-cta-radio");
    expect(apply).toContain("requestId");
    expect(apply).toContain("data-owner-popup-visible-crop");
    expect(apply).toContain("data-owner-popup-submit-confirm");
    expect(apply).not.toMatch(/setSurfaces\(\(prev\)/);
  });
});
