import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPlatformEventDbRow, type PlatformEventDbRow } from "@/lib/platform-events/map-row";
import { serializePlatformEventSections } from "@/lib/platform-events/sections";
import {
  isPlatformEventStatus,
  PLATFORM_EVENT_DEFAULT_TIMEZONE,
  PLATFORM_EVENTS_SELECT,
} from "@/lib/platform-events/types";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-events — list */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("platform_events")
    .select(PLATFORM_EVENTS_SELECT)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const events = ((data ?? []) as PlatformEventDbRow[]).map(mapPlatformEventDbRow);
  return NextResponse.json({ ok: true, events });
}

/** POST /api/admin/platform-events — create */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  const statusRaw = String(body.status ?? "draft").trim().toLowerCase();
  const status = isPlatformEventStatus(statusRaw) ? statusRaw : "draft";
  const sections = serializePlatformEventSections(body.sections as never);
  const ctaType = String(body.ctaType ?? body.cta_type ?? "").trim() || null;
  const ctaTarget = String(body.ctaTarget ?? body.cta_target ?? "").trim();
  const ctaExternalUrl = String(body.ctaExternalUrl ?? body.cta_external_url ?? "").trim() || null;
  const ctaLabel = String(body.ctaLabel ?? body.cta_label ?? "").trim() || null;

  if (ctaType) {
    const v = validatePlatformPopupCta({
      ctaType,
      ctaTarget,
      externalUrl: ctaExternalUrl,
    });
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    }
    if (ctaType === "event_detail") {
      return NextResponse.json({ ok: false, error: "event_detail_loop_forbidden" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const insert = {
    title,
    subtitle: String(body.subtitle ?? "").trim() || null,
    hero_image_url: String(body.heroImageUrl ?? body.hero_image_url ?? "").trim() || null,
    hero_image_path: String(body.heroImagePath ?? body.hero_image_path ?? "").trim() || null,
    sections,
    terms: String(body.terms ?? "").trim() || null,
    status,
    starts_at: body.startsAt ?? body.starts_at ?? null,
    ends_at: body.endsAt ?? body.ends_at ?? null,
    timezone: String(body.timezone ?? PLATFORM_EVENT_DEFAULT_TIMEZONE).trim() || PLATFORM_EVENT_DEFAULT_TIMEZONE,
    cta_label: ctaLabel,
    cta_type: ctaType,
    cta_target: ctaTarget,
    cta_external_url: ctaExternalUrl,
    published_at: status === "published" ? now : null,
    created_by: admin.userId,
    updated_by: admin.userId,
  };

  const { data, error } = await sb
    .from("platform_events")
    .insert(insert)
    .select(PLATFORM_EVENTS_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, event: mapPlatformEventDbRow(data as PlatformEventDbRow) });
}
