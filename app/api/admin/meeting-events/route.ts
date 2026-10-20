import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { MEETING_EVENT_TYPES } from "@/lib/neighborhood/meeting-event-format";
import { listMeetingEventsAdminPage } from "@/lib/neighborhood/meeting-events-admin-query";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV 한 번에 내보내는 최대 건수 · 조회 함수 한 번 최대 건수 */
const MEETING_EVENTS_CSV_MAX = 5000;
const MEETING_EVENTS_LOADER_PAGE = 100;

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * GET /api/admin/meeting-events
 * Query: meetingId?, type?, limit? (JSON: 20|50|100, 그 외 50 · CSV: 1–5000, 100건씩 이어 읽음), offset? (0–10000), format=json|csv
 * → JSON `{ ok, events, hasMore, total(count exact), offset, limit }` · 조회 실패는 500 (빈 목록으로 숨기지 않음)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const meetingId = sp.get("meetingId")?.trim() || null;
  const eventType = sp.get("type")?.trim() || null;
  const format = (sp.get("format") ?? "json").trim().toLowerCase();

  const limitRaw = Number(sp.get("limit"));
  const offsetRaw = Number(sp.get("offset"));
  // CSV: 요청 건수 그대로(1~5000). 조회 함수는 한 번에 100건까지라 아래에서 100건씩 이어 읽는다
  // (예전: 1~100 으로 잘려 화면의 500건 요청이 100건만 나왔다).
  const csvLimit =
    Number.isFinite(limitRaw) && sp.has("limit") ? Math.min(Math.max(Math.floor(limitRaw), 1), MEETING_EVENTS_CSV_MAX) : 50;
  const limit = format === "csv" ? csvLimit : normalizeAdminListPageSize(sp.get("limit"), 50);
  const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(Math.floor(offsetRaw), 0), 10_000) : 0;

  if (eventType && !(MEETING_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  if (format === "csv") {
    const events: Awaited<ReturnType<typeof listMeetingEventsAdminPage>>["events"] = [];
    for (let at = offset; events.length < limit; ) {
      const want = Math.min(MEETING_EVENTS_LOADER_PAGE, limit - events.length);
      const page = await listMeetingEventsAdminPage({ meetingId, eventType, limit: want, offset: at });
      if (page.error) return NextResponse.json({ ok: false, error: page.error }, { status: 500 });
      events.push(...page.events);
      if (!page.hasMore || page.events.length === 0) break;
      at += page.events.length;
    }
    return meetingEventsCsvResponse(events);
  }

  const { events, hasMore, total, error } = await listMeetingEventsAdminPage({
    meetingId,
    eventType,
    limit,
    offset,
  });
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
  return NextResponse.json({ ok: true, events, hasMore, total, offset, limit });
}

function meetingEventsCsvResponse(events: Awaited<ReturnType<typeof listMeetingEventsAdminPage>>["events"]) {
  const header = [
    "id",
    "meeting_id",
    "meeting_title",
    "event_type",
    "actor_user_id",
    "actor_name",
    "target_user_id",
    "target_name",
    "created_at",
    "payload_json",
  ];
  const lines = [
    header.join(","),
    ...events.map((e) =>
      [
        csvEscape(e.id),
        csvEscape(e.meeting_id),
        csvEscape(e.meeting_title ?? ""),
        csvEscape(e.event_type),
        csvEscape(e.actor_user_id ?? ""),
        csvEscape(e.actor_name),
        csvEscape(e.target_user_id ?? ""),
        csvEscape(e.target_name ?? ""),
        csvEscape(e.created_at),
        csvEscape(JSON.stringify(e.payload ?? {})),
      ].join(",")
    ),
  ];
  const body = "\uFEFF" + lines.join("\r\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-events-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
