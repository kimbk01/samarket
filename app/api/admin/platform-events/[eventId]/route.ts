import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPlatformEventDbRow, type PlatformEventDbRow } from "@/lib/platform-events/map-row";
import { serializePlatformEventSections } from "@/lib/platform-events/sections";
import {
  isPlatformEventStatus,
  PLATFORM_EVENT_DEFAULT_TIMEZONE,
} from "@/lib/platform-events/types";
import {
  isPlatformEventLifecycleAction,
  parsePlatformEventBoardFields,
  platformEventLifecyclePatch,
  validatePlatformEventCtaDestination,
  validatePlatformEventSchedule,
  validatePlatformEventSectionCtas,
} from "@/lib/platform-events/admin-validation";
import {
  selectPlatformEventsWithBoardFallback,
  writePlatformEventWithBoardFallback,
} from "@/lib/platform-events/board-columns-fallback";

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
  const { data, error, boardColumns } = await selectPlatformEventsWithBoardFallback((select) =>
    sb.from("platform_events").select(select).eq("id", eventId).maybeSingle()
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    event: mapPlatformEventDbRow(data as PlatformEventDbRow),
    boardColumnsApplied: boardColumns,
  });
}

/**
 * PATCH /api/admin/platform-events/[eventId]
 * Field edits + optional `action: "publish" | "unpublish" | "archive"` (editor confirms first).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  // G-18: 홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
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
  if (body.sections !== undefined) {
    const sectionCheck = validatePlatformEventSectionCtas(body.sections);
    if (!sectionCheck.ok) {
      return NextResponse.json({ ok: false, error: sectionCheck.error }, { status: 400 });
    }
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
      const v = validatePlatformEventCtaDestination({
        ctaType,
        ctaTarget: ctaTarget ?? "",
        externalUrl: ctaExternalUrl ?? null,
      });
      if (!v.ok) {
        return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
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
      patch.archived_at = null;
    }
  }

  if (body.action !== undefined) {
    if (!isPlatformEventLifecycleAction(body.action)) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }
    Object.assign(patch, platformEventLifecyclePatch(body.action, new Date().toISOString()));
  }
  // R2 — 게시(노출 시작, L2)는 처리 사유 필수. 게시 중지·보관(L1)은 선택. 감사 after.reason 에 남긴다.
  const adminReason = parseAdminReason(body.reason);
  if (body.action === "publish" && !adminReason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const board = parsePlatformEventBoardFields(body);
  if (!board.ok) {
    return NextResponse.json({ ok: false, error: board.error }, { status: 400 });
  }
  Object.assign(patch, board.patch);

  if (patch.starts_at !== undefined || patch.ends_at !== undefined) {
    // Validate the resulting window (DB CHECK starts_at < ends_at).
    const { data: cur } = await sb
      .from("platform_events")
      .select("starts_at, ends_at")
      .eq("id", eventId)
      .maybeSingle();
    const schedule = validatePlatformEventSchedule(
      patch.starts_at !== undefined ? patch.starts_at : cur?.starts_at,
      patch.ends_at !== undefined ? patch.ends_at : cur?.ends_at
    );
    if (!schedule.ok) {
      return NextResponse.json({ ok: false, error: schedule.error }, { status: 400 });
    }
  }

  const { data, error, boardColumns } = await writePlatformEventWithBoardFallback(
    patch,
    (payload, select) =>
      sb.from("platform_events").update(payload).eq("id", eventId).select(select).maybeSingle()
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "platform_event",
    targetId: eventId,
    action: "platform_event.update",
    after: {
      fields: Object.keys(patch).filter((k) => k !== "updated_by" && k !== "updated_at"),
      status: patch.status ?? null,
      lifecycleAction: typeof body.action === "string" ? body.action : null,
      reason: adminReason,
    },
  });
  return NextResponse.json({
    ok: true,
    event: mapPlatformEventDbRow(data as PlatformEventDbRow),
    boardColumnsApplied: boardColumns,
  });
}
