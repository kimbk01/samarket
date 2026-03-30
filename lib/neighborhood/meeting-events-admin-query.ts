import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isMeetingEventType } from "@/lib/neighborhood/meeting-event-format";
import type { AdminMeetingEventRow } from "@/lib/neighborhood/types";

export async function listMeetingEventsAdminPage(options: {
  meetingId?: string | null;
  eventType?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ events: AdminMeetingEventRow[]; hasMore: boolean }> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { events: [], hasMore: false };
  }

  const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 10_000);
  const fetchCount = pageSize + 1;

  let q = sb
    .from("meeting_events")
    .select("id, meeting_id, actor_user_id, target_user_id, event_type, payload, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const mid = options.meetingId?.trim() ?? "";
  if (mid) q = q.eq("meeting_id", mid);

  const et = options.eventType?.trim() ?? "";
  if (et && isMeetingEventType(et)) q = q.eq("event_type", et);

  const { data, error } = await q.range(offset, offset + fetchCount - 1);

  if (error || !Array.isArray(data)) return { events: [], hasMore: false };

  const hasMore = data.length > pageSize;
  const slice = hasMore ? data.slice(0, pageSize) : data;

  const meetingIds = [...new Set(slice.map((row) => String(row.meeting_id ?? "")).filter(Boolean))];
  const titleMap = new Map<string, string>();
  if (meetingIds.length > 0) {
    const { data: meetings } = await sb.from("meetings").select("id, title").in("id", meetingIds);
    if (Array.isArray(meetings)) {
      for (const m of meetings) {
        const id = String((m as { id?: string }).id ?? "");
        if (id) titleMap.set(id, String((m as { title?: string }).title ?? ""));
      }
    }
  }

  const userIds = [
    ...new Set(
      slice
        .flatMap((row) => [String(row.actor_user_id ?? "").trim(), String(row.target_user_id ?? "").trim()])
        .filter(Boolean)
    ),
  ];
  const nickMap = await fetchNicknamesForUserIds(sb as never, userIds);

  const events: AdminMeetingEventRow[] = slice.map((row) => {
    const meetingId = String(row.meeting_id ?? "");
    const actorId = row.actor_user_id != null ? String(row.actor_user_id) : null;
    const targetId = row.target_user_id != null ? String(row.target_user_id) : null;
    return {
      id: String(row.id),
      meeting_id: meetingId,
      meeting_title: titleMap.get(meetingId) ?? null,
      actor_user_id: actorId,
      actor_name: actorId ? nickMap.get(actorId) ?? actorId.slice(0, 8) : "시스템",
      target_user_id: targetId,
      target_name: targetId ? nickMap.get(targetId) ?? targetId.slice(0, 8) : null,
      event_type: String(row.event_type ?? ""),
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
      created_at: String(row.created_at ?? ""),
    };
  });

  return { events, hasMore };
}
