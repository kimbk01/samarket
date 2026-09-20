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

type Ctx = { params: Promise<{ eventId: string }> };

/** GET /api/admin/platform-events/[eventId] */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { eventId } = await ctx.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("platform_events")
    .select(PLATFORM_EVENTS_SELECT)
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, event: mapPlatformEventDbRow(data as PlatformEventDbRow) });
}

/** PATCH /api/admin/platform-events/[eventId] */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { eventId } = await ctx.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  };

  if (body.title != null) {
    const title = String(body.title).trim().slice(0, 200);
    if (!title) {
      return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.subtitle !== undefined) {
    patch.subtitle = String(body.subtitle ?? "").trim() || null;
  }
  if (body.heroImageUrl !== undefined || body.hero_image_url !== undefined) {
    patch.hero_image_url =
      String(body.heroImageUrl ?? body.hero_image_url ?? "").trim() || null;
  }
  if (body.heroImagePath !== undefined || body.hero_image_path !== undefined) {
    patch.hero_image_path =
      String(body.heroImagePath ?? body.hero_image_path ?? "").trim() || null;
  }
  if (body.sections !== undefined) {
    patch.sections = serializePlatformEventSections(body.sections as never);
  }
  if (body.terms !== undefined) {
    patch.terms = String(body.terms ?? "").trim() || null;
  }
  if (body.startsAt !== undefined || body.starts_at !== undefined) {
    patch.starts_at = body.startsAt ?? body.starts_at ?? null;
  }
  if (body.endsAt !== undefined || body.ends_at !== undefined) {
    patch.ends_at = body.endsAt ?? body.ends_at ?? null;
  }
  if (body.timezone !== undefined) {
    patch.timezone =
      String(body.timezone ?? "").trim() || PLATFORM_EVENT_DEFAULT_TIMEZONE;
  }

  const ctaType =
    body.ctaType !== undefined || body.cta_type !== undefined
      ? String(body.ctaType ?? body.cta_type ?? "").trim() || null
      : undefined;
  const ctaTarget =
    body.ctaTarget !== undefined || body.cta_target !== undefined
      ? String(body.ctaTarget ?? body.cta_target ?? "").trim()
      : undefined;
  const ctaExternalUrl =
    body.ctaExternalUrl !== undefined || body.cta_external_url !== undefined
      ? String(body.ctaExternalUrl ?? body.cta_external_url ?? "").trim() || null
      : undefined;
  const ctaLabel =
    body.ctaLabel !== undefined || body.cta_label !== undefined
      ? String(body.ctaLabel ?? body.cta_label ?? "").trim() || null
      : undefined;

  if (ctaType !== undefined) {
    if (ctaType) {
      const v = validatePlatformPopupCta({
        ctaType,
        ctaTarget: ctaTarget ?? "",
        externalUrl: ctaExternalUrl ?? null,
      });
      if (!v.ok) {
        return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
      }
      if (ctaType === "event_detail") {
        return NextResponse.json({ ok: false, error: "event_detail_loop_forbidden" }, { status: 400 });
      }
    }
    patch.cta_type = ctaType;
  }
  if (ctaTarget !== undefined) patch.cta_target = ctaTarget;
  if (ctaExternalUrl !== undefined) patch.cta_external_url = ctaExternalUrl;
  if (ctaLabel !== undefined) patch.cta_label = ctaLabel;

  if (body.status !== undefined) {
    const statusRaw = String(body.status).trim().toLowerCase();
    if (!isPlatformEventStatus(statusRaw)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }
    patch.status = statusRaw;
    if (statusRaw === "published") {
      patch.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await sb
    .from("platform_events")
    .update(patch)
    .eq("id", eventId)
    .select(PLATFORM_EVENTS_SELECT)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, event: mapPlatformEventDbRow(data as PlatformEventDbRow) });
}
