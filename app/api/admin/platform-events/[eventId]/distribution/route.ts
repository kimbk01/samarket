import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  distributionsToToggles,
  listDistributionsForEvent,
} from "@/lib/platform-promotion-distribution/repository";
import { saveEventDistribution } from "@/lib/platform-promotion-distribution/save-event-distribution";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/** GET — orchestration state only (Admin). Runtime apps do not read this. */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { eventId } = await ctx.params;
  const id = String(eventId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  try {
    const rows = await listDistributionsForEvent(sb, id);
    return NextResponse.json({
      ok: true,
      toggles: distributionsToToggles(rows),
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

/**
 * PUT — save distribution configuration.
 * Never dispatches Push. Never creates Bell inbox rows by itself
 * beyond draft admin_notification_campaign config.
 */
export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { eventId } = await ctx.params;
  const id = String(eventId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    eventTitle?: string;
    toggles?: {
      popup?: boolean;
      banner?: boolean;
      push?: boolean;
      bell?: boolean;
    };
    popup?: Record<string, unknown>;
    banner?: Record<string, unknown>;
    push?: Record<string, unknown>;
    bell?: Record<string, unknown>;
  };

  const { data: eventRow, error: eventErr } = await sb
    .from("platform_events")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (eventErr) {
    return NextResponse.json({ ok: false, error: eventErr.message }, { status: 500 });
  }
  if (!eventRow?.id) {
    return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  }

  const result = await saveEventDistribution(sb, {
    eventId: id,
    eventTitle: String(body.eventTitle ?? eventRow.title ?? "Event"),
    adminUserId: admin.userId,
    toggles: {
      popup: Boolean(body.toggles?.popup),
      banner: Boolean(body.toggles?.banner),
      push: Boolean(body.toggles?.push),
      bell: Boolean(body.toggles?.bell),
    },
    popup: body.popup as never,
    banner: body.banner as never,
    push: body.push as never,
    bell: body.bell as never,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    toggles: distributionsToToggles(result.rows),
    rows: result.rows,
    pushDispatchCount: result.pushDispatchCount,
    bellRecordCount: result.bellRecordCount,
  });
}
