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
  parsePlatformEventBoardFields,
  validatePlatformEventCtaDestination,
  validatePlatformEventSchedule,
  validatePlatformEventSectionCtas,
} from "@/lib/platform-events/admin-validation";
import {
  selectPlatformEventsWithBoardFallback,
  writePlatformEventWithBoardFallback,
} from "@/lib/platform-events/board-columns-fallback";
import {
  channelSummaryFromDistributionRowsPreferringPresentation,
  listDistributionsForEvents,
} from "@/lib/platform-promotion-distribution/repository";
import {
  parsePlatformAdminListPage,
  platformAdminListRange,
} from "@/lib/admin/platform-list/admin-platform-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform-events — list
 * - `limit`(20/50/100)·`offset` 이 있으면 서버 페이지 + `total`(count exact) — 이벤트 목록 화면.
 * - 없으면 기존 응답(최근 수정 200건) — 알림 캠페인 화면의 이벤트 제목 맵 호출자 호환.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const page = parsePlatformAdminListPage(req.nextUrl.searchParams);
  const result = await selectPlatformEventsWithBoardFallback((select) => {
    if (page) {
      const [from, to] = platformAdminListRange(page);
      return sb
        .from("platform_events")
        .select(select, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
    }
    return sb.from("platform_events").select(select).order("updated_at", { ascending: false }).limit(200);
  });
  const { data, error } = result;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const events = ((data ?? []) as PlatformEventDbRow[]).map(mapPlatformEventDbRow);
  let channelByEventId: Record<string, string> = {};
  try {
    const distRows = await listDistributionsForEvents(
      sb,
      events.map((e) => e.id)
    );
    const byId = new Map<string, typeof distRows>();
    for (const row of distRows) {
      const list = byId.get(row.contentId) ?? [];
      list.push(row);
      byId.set(row.contentId, list);
    }
    channelByEventId = Object.fromEntries(
      [...byId.entries()].map(([id, rows]) => [
        id,
        channelSummaryFromDistributionRowsPreferringPresentation(rows, "ko"),
      ])
    );
  } catch {
    channelByEventId = {};
  }
  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      ...e,
      channelSummary: channelByEventId[e.id] ?? "채널 없음",
    })),
    ...(page
      ? {
          total: (result as unknown as { count?: number | null }).count ?? events.length,
          limit: page.limit,
          offset: page.offset,
        }
      : {}),
  });
}

/** POST /api/admin/platform-events — create */
export async function POST(req: NextRequest) {
  // G-18: 홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
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
  // R2 — 새 이벤트를 바로 게시(노출 시작, L2)할 때는 처리 사유 필수. 감사 after.reason 에 남긴다.
  const adminReason = parseAdminReason(body.reason);
  if (body.action === "publish" && !adminReason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const sections = serializePlatformEventSections(body.sections as never);
  const ctaType = String(body.ctaType ?? body.cta_type ?? "").trim() || null;
  const ctaTarget = String(body.ctaTarget ?? body.cta_target ?? "").trim();
  const ctaExternalUrl = String(body.ctaExternalUrl ?? body.cta_external_url ?? "").trim() || null;
  const ctaLabel = String(body.ctaLabel ?? body.cta_label ?? "").trim() || null;

  if (ctaType) {
    const v = validatePlatformEventCtaDestination({
      ctaType,
      ctaTarget,
      externalUrl: ctaExternalUrl,
    });
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    }
  }
  const sectionCheck = validatePlatformEventSectionCtas(body.sections);
  if (!sectionCheck.ok) {
    return NextResponse.json({ ok: false, error: sectionCheck.error }, { status: 400 });
  }
  const startsAt = body.startsAt ?? body.starts_at ?? null;
  const endsAt = body.endsAt ?? body.ends_at ?? null;
  const schedule = validatePlatformEventSchedule(startsAt, endsAt);
  if (!schedule.ok) {
    return NextResponse.json({ ok: false, error: schedule.error }, { status: 400 });
  }
  const board = parsePlatformEventBoardFields(body);
  if (!board.ok) {
    return NextResponse.json({ ok: false, error: board.error }, { status: 400 });
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
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: String(body.timezone ?? PLATFORM_EVENT_DEFAULT_TIMEZONE).trim() || PLATFORM_EVENT_DEFAULT_TIMEZONE,
    cta_label: ctaLabel,
    cta_type: ctaType,
    cta_target: ctaTarget,
    cta_external_url: ctaExternalUrl,
    published_at: status === "published" ? now : null,
    created_by: admin.userId,
    updated_by: admin.userId,
    ...board.patch,
  };

  const { data, error, boardColumns } = await writePlatformEventWithBoardFallback(
    insert,
    (payload, select) => sb.from("platform_events").insert(payload).select(select).single()
  );
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  const created = mapPlatformEventDbRow(data as PlatformEventDbRow);
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "platform_event",
    targetId: created.id,
    action: "platform_event.create",
    after: { title, status, startsAt, endsAt, reason: adminReason },
  });
  return NextResponse.json({
    ok: true,
    event: created,
    boardColumnsApplied: boardColumns,
  });
}
