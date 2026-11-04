/**
 * Active Event-owned HERO banners — Distribution SSOT only.
 * No Delivery paid campaign write. No MEMBER_REQUESTED billing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlatformEventAvailability } from "@/lib/platform-events/publication";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import { normalizeEventBannerPresentation } from "@/lib/platform-promotion-distribution/banner-presentation";
import { mapPromotionDistributionDbRow } from "@/lib/platform-promotion-distribution/map-row";

/**
 * EV-3 (2026-11-04): 같은 위치에 히어로가 여러 개면 화면은 첫 번째만 보인다 → 순서를 고정한다.
 * 기준 = 최근 수정(updated_at) 먼저 · 같으면 id 오름차순.
 */
export function compareEventHeroBannerRows(
  a: { id: string; updatedAt: string },
  b: { id: string; updatedAt: string }
): number {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  const va = Number.isFinite(ta) ? ta : 0;
  const vb = Number.isFinite(tb) ? tb : 0;
  if (va !== vb) return vb - va;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

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

  // EV-3: 순서는 여기서 한 번 고정한다 (DB 응답 순서에 기대지 않음)

  const rows = (data ?? [])
    .map((raw) => mapPromotionDistributionDbRow(raw as never))
    .sort(compareEventHeroBannerRows);
  const out: EventHeroBannerRuntimeItem[] = [];
  for (const row of rows) {
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
      // EV-2: 히어로 제목은 그림 위에 쓰지 않고 대체 텍스트로만 쓰인다 — 비면 아래에서 이벤트 제목으로 채운다
      headline: String(cfg.headline ?? "").trim(),
      href: buildPlatformEventDetailPath(eventId),
    });
  }
  if (out.length === 0) return out;

  // Same publication SSOT as Event Detail / send eligibility: only active (published, in period) Events.
  const eventIds = [...new Set(out.map((item) => item.eventId))];
  const { data: events, error: eventsError } = await sb
    .from("platform_events")
    .select("id, title, status, starts_at, ends_at")
    .in("id", eventIds);
  if (eventsError) throw new Error(eventsError.message);
  const activeEventIds = new Set<string>();
  const titleByEventId = new Map<string, string>();
  for (const ev of (events ?? []) as {
    id: string;
    title?: string | null;
    status?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  }[]) {
    const availability = resolvePlatformEventAvailability({
      status: ev.status,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
    });
    if (availability === "active") activeEventIds.add(String(ev.id));
    titleByEventId.set(String(ev.id), String(ev.title ?? "").trim());
  }
  return out
    .filter((item) => activeEventIds.has(item.eventId))
    .map((item) => (item.headline ? item : { ...item, headline: titleByEventId.get(item.eventId) ?? "" }));
}
