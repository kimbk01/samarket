import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  isEventBannerPlacement,
  normalizeEventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import { mapPromotionDistributionDbRow } from "@/lib/platform-promotion-distribution/map-row";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — read-only banner distribution inventory for Admin Promotion IA (no writer). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: distRows, error: distErr } = await sb
    .from("platform_promotion_distributions")
    .select(
      "id, content_type, content_id, channel, enabled, status, channel_ref_type, channel_ref_id, config, created_at, updated_at"
    )
    .eq("channel", "banner")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (distErr) {
    return NextResponse.json({ ok: false, error: distErr.message }, { status: 500 });
  }

  const mapped = (distRows ?? []).map((row) =>
    mapPromotionDistributionDbRow(row as Parameters<typeof mapPromotionDistributionDbRow>[0])
  );
  const eventIds = [...new Set(mapped.map((r) => r.contentId).filter(Boolean))];

  const titleById = new Map<string, { title: string; startsAt: string | null; endsAt: string | null }>();
  if (eventIds.length > 0) {
    const { data: events, error: evErr } = await sb
      .from("platform_events")
      .select("id, title, starts_at, ends_at")
      .in("id", eventIds);
    if (evErr) {
      return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
    }
    for (const ev of events ?? []) {
      titleById.set(String((ev as { id: string }).id), {
        title: String((ev as { title?: string }).title ?? ""),
        startsAt: (ev as { starts_at?: string | null }).starts_at ?? null,
        endsAt: (ev as { ends_at?: string | null }).ends_at ?? null,
      });
    }
  }

  const items = mapped.map((row) => {
    const presentation = normalizeEventBannerPresentation(
      String(row.config.presentation ?? "")
    );
    const placementRaw = String(row.config.placement ?? "").trim().toUpperCase();
    const placement = isEventBannerPlacement(placementRaw) ? placementRaw : "TRADE_HOME";
    const ev = titleById.get(row.contentId);
    return {
      distributionId: row.id,
      eventId: row.contentId,
      eventTitle: ev?.title || row.contentId,
      placement,
      presentation,
      status: row.status,
      enabled: row.enabled,
      startsAt: ev?.startsAt ?? null,
      endsAt: ev?.endsAt ?? null,
      href: buildPlatformEventDetailPath(row.contentId),
    };
  });

  return NextResponse.json({ ok: true, items });
}
