/**
 * Active Event-owned HERO banners — Distribution SSOT only.
 * No Delivery paid campaign write. No MEMBER_REQUESTED billing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import { normalizeEventBannerPresentation } from "@/lib/platform-promotion-distribution/banner-presentation";
import { mapPromotionDistributionDbRow } from "@/lib/platform-promotion-distribution/map-row";

export type EventHeroBannerRuntimeItem = {
  distributionId: string;
  eventId: string;
  placement: string;
  domain: "trade" | "community";
  imageUrl: string;
  headline: string;
  href: string;
};

export async function loadActiveEventHeroBanners(
  sb: SupabaseClient,
  input: { placement: "TRADE_HOME" | "COMMUNITY_HOME" }
): Promise<EventHeroBannerRuntimeItem[]> {
  const { data, error } = await sb
    .from("platform_promotion_distributions")
    .select("*")
    .eq("channel", "banner")
    .eq("enabled", true)
    .in("status", ["configured", "active"]);
  if (error) throw new Error(error.message);

  const out: EventHeroBannerRuntimeItem[] = [];
  for (const raw of data ?? []) {
    const row = mapPromotionDistributionDbRow(raw as never);
    const cfg = row.config ?? {};
    const presentation = normalizeEventBannerPresentation(String(cfg.presentation ?? ""));
    if (presentation !== "HERO_BANNER") continue;
    const placement = String(cfg.placement ?? "TRADE_HOME").trim().toUpperCase();
    if (placement !== input.placement) continue;
    const imageUrl = String(cfg.imageUrl ?? "").trim();
    if (!imageUrl) continue;
    const eventId = String(row.contentId);
    out.push({
      distributionId: row.id,
      eventId,
      placement,
      domain: placement.startsWith("COMMUNITY") ? "community" : "trade",
      imageUrl,
      headline: String(cfg.headline ?? "").trim() || "Event",
      href: buildPlatformEventDetailPath(eventId),
    });
  }
  return out;
}
