import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("platform popup CUT 1 — admin API + migration authority", () => {
  it("Admin transition route requires requireAdminApiUser", () => {
    const route = readFileSync(
      join(
        root,
        "app/api/admin/platform-popup-campaigns/[campaignId]/transition/route.ts"
      ),
      "utf8"
    );
    expect(route).toContain("requireAdminApiUser");
    expect(route).toContain("adminApprovePlatformPopupCampaign");
    expect(route).toContain("transitionPlatformPopupCampaign");
  });

  it("migration creates dedicated platform_popup_* SSOT with RLS", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20261202200000_platform_popup_ssot_cut1.sql"),
      "utf8"
    );
    for (const table of [
      "platform_popup_campaigns",
      "platform_popup_creatives",
      "platform_popup_campaign_surfaces",
      "platform_popup_campaign_events",
      "platform_popup_user_suppressions",
    ]) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("is_platform_admin");
    expect(sql).toContain("platform_popup_campaigns_active_requires_approval");
    expect(sql).toContain("aspect_w = 36 AND aspect_h = 25");
    expect(sql).toMatch(/Dedicated domain\. NOT store_banner_ad_campaigns/);
    expect(sql).not.toMatch(/CREATE TABLE[\s\S]*store_banner_ad_campaigns/);
    expect(sql).not.toMatch(/REFERENCES public\.(store_banner_ad_campaigns|feed_ad_campaigns)/);
  });

  it("CUT 0-C / 0-D lock docs remain present (not deleted)", () => {
    const c = readFileSync(
      join(root, "docs/dibay-global-popup-ad-product-contract-lock.md"),
      "utf8"
    );
    const d = readFileSync(
      join(root, "docs/dibay-global-popup-ad-measured-geometry-lock.md"),
      "utf8"
    );
    expect(c).toContain("PRODUCT_CONTRACT_LOCKED");
    expect(d).toContain("GEOMETRY_CONTRACT_LOCKED");
  });
});
