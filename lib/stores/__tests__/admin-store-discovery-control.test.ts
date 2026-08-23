import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_STORE_DISCOVERY_CONTROL_V1,
  buildAdminStoreDiscoveryDiagnostics,
  classifyAdminStoreDiscoveryCampaignMonitorState,
} from "@/lib/stores/admin-store-discovery-control";
import { isNewStoreSignal, NEW_STORE_WINDOW_DAYS } from "@/lib/stores/store-new-store-signal";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import {
  STORE_DISCOVERY_CAMPAIGN_HTTP_WRITER,
  STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY,
  canWriteStoreDiscoveryCampaign,
} from "@/lib/stores/store-discovery-campaign-authority";
import { STORE_FIRST_LISTED_AT_COLUMN } from "@/lib/stores/store-first-listed-at";

const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listRouteFiles(p));
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

describe("Admin Discovery Control v1", () => {
  it("locks v1 as read-mostly only", () => {
    expect(ADMIN_STORE_DISCOVERY_CONTROL_V1).toBe("read_mostly_only");
  });

  it("T1 rating policy read projects singleton fields (shape contract)", () => {
    const src = read("lib/stores/admin-store-discovery-control.ts");
    expect(src).toContain('from("store_rating_confidence_policy")');
    expect(src).toContain(
      'select("global_mean_rating, prior_weight, rating_count, updated_at")'
    );
    expect(src).toContain("global_mean_rating");
    expect(src).toContain("prior_weight");
    expect(src).toContain("rating_count");
    expect(src).toContain("updated_at");
    expect(src).toContain('status: "active"');
    expect(src).toContain('status: "fallback_raw"');
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it("T2 campaign active/upcoming/expired/inactive classification", () => {
    expect(
      classifyAdminStoreDiscoveryCampaignMonitorState({
        isActive: true,
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe("active");
    expect(
      classifyAdminStoreDiscoveryCampaignMonitorState({
        isActive: true,
        startAt: "2026-08-24T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe("upcoming");
    expect(
      classifyAdminStoreDiscoveryCampaignMonitorState({
        isActive: true,
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-08-20T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe("expired");
    expect(
      classifyAdminStoreDiscoveryCampaignMonitorState({
        isActive: false,
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe("inactive");
  });

  it("T3 first_listed_at read column is authority SSOT", () => {
    expect(STORE_FIRST_LISTED_AT_COLUMN).toBe("first_listed_at");
    const src = read("lib/stores/admin-store-discovery-control.ts");
    expect(src).toContain("first_listed_at");
    // no override write
    expect(src).not.toMatch(/\.update\(\{[^}]*first_listed_at/);
  });

  it("T4 new-store 30d qualification reuses isNewStoreSignal", () => {
    expect(NEW_STORE_WINDOW_DAYS).toBe(30);
    const listed = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewStoreSignal({ firstListedAt: listed, nowMs: NOW })).toBe(true);
    const old = new Date(NOW - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewStoreSignal({ firstListedAt: old, nowMs: NOW })).toBe(false);
    const src = read("lib/stores/admin-store-discovery-control.ts");
    expect(src).toContain("isNewStoreSignal");
    expect(src).toContain("NEW_STORE_WINDOW_DAYS");
  });

  it("T5 Cut A mode read reuses commerce extras (no campaign merge)", () => {
    const extras = parseCommerceExtrasFromHoursJson({
      delivery_fee_mode: "self_free_promo",
      delivery_fee_strike_reference_php: 49,
    });
    expect(extras.deliveryFeeMode).toBe("self_free_promo");
    expect(extras.deliveryFeeStrikeReferencePhp).toBe(49);
    const src = read("lib/stores/admin-store-discovery-control.ts");
    expect(src).toContain("parseCommerceExtrasFromHoursJson");
    expect(src).toContain("delivery_fee_mode");
    expect(src).not.toMatch(/campaign.*self_free_promo|self_free_promo.*campaign/);
  });

  it("T6 active campaign summary uses existing campaign authority helpers", () => {
    const src = read("lib/stores/admin-store-discovery-control.ts");
    expect(src).toContain("selectActiveStoreDiscoveryCampaignsForHome");
    expect(src).toContain("isStoreDiscoveryCampaignActive");
    expect(src).toContain("active_discovery_campaign");
  });

  it("T7 Admin auth required on all discovery control routes", () => {
    const routes = listRouteFiles(join(ROOT, "app/api/admin/store-discovery"));
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const route of routes) {
      const src = readFileSync(route, "utf8");
      expect(src).toContain("isRouteAdmin");
      expect(src).toContain('error: "forbidden"');
    }
  });

  it("T8 campaign HTTP writer is scoped to campaigns route only", () => {
    const routes = listRouteFiles(join(ROOT, "app/api/admin/store-discovery"));
    const writerRoute = join(ROOT, "app/api/admin/store-discovery/campaigns/route.ts");

    for (const route of routes) {
      const src = readFileSync(route, "utf8");
      expect(src).toMatch(/export async function GET/);

      if (route === writerRoute) {
        expect(src).toMatch(/export async function POST/);
        expect(src).toMatch(/export async function PATCH/);
        expect(src).not.toMatch(/export async function PUT/);
        expect(src).not.toMatch(/export async function DELETE/);
        expect(src).toContain("createStoreDiscoveryCampaignAdmin");
        expect(src).toContain("updateStoreDiscoveryCampaignAdmin");
      } else {
        expect(src).not.toMatch(/export async function POST/);
        expect(src).not.toMatch(/export async function PATCH/);
        expect(src).not.toMatch(/export async function PUT/);
        expect(src).not.toMatch(/export async function DELETE/);
      }
    }

    expect(canWriteStoreDiscoveryCampaign("admin", "create")).toBe(true);
    expect(STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY.admin.create).toBe(true);
    expect(STORE_DISCOVERY_CAMPAIGN_HTTP_WRITER).toBe("ADMIN_HTTP");
  });

  it("T9 closed discovery authorities unchanged (no HOME/BROWSE/composer edits in this track)", () => {
    const control = read("lib/stores/admin-store-discovery-control.ts");
    expect(control).not.toContain("stores-home-composer");
    expect(control).not.toContain("stores-browse-build");
    expect(control).not.toContain("computeBayesianWeightedRating");
    const diag = buildAdminStoreDiscoveryDiagnostics({});
    expect(diag.ranking_authority).toBe("new");
    expect(diag.public_api_meta_keys.browse).toContain("rating_confidence");
    expect(diag.public_api_meta_keys.home_feed).toContain("discoveryCampaigns.status");
    expect(diag.note.toLowerCase()).toContain("no per-store rank explain");
  });
});
