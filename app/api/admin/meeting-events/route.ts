import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { MEETING_EVENT_TYPES } from "@/lib/neighborhood/meeting-event-format";
import { listMeetingEventsAdminPage } from "@/lib/neighborhood/meeting-events-admin-query";

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * GET /api/admin/meeting-events
 * Query: meetingId?, type?, limit? (1–100, default 50), offset? (0–10000), format=json|csv
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
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(Math.floor(offsetRaw), 0), 10_000) : 0;

  if (eventType && !(MEETING_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const { events, hasMore } = await listMeetingEventsAdminPage({
    meetingId,
    eventType,
    limit: format === "csv" ? Math.min(limit, 500) : limit,
    offset: format === "csv" ? offset : offset,
  });

  if (format === "csv") {
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

  return NextResponse.json({ ok: true, events, hasMore, offset, limit });
}
