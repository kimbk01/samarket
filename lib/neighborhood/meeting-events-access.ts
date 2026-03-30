import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserPlatformAdminDb } from "@/lib/admin/platform-admin-db";

/** RLS(`meeting_events_select_v1`)과 동일한 서버측 판단 — 서비스 롤 사용 시 수동 검증용 */
export async function canUserViewMeetingEvents(
  sb: SupabaseClient<any>,
  meetingId: string,
  userId: string
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const { data: meeting } = await sb
    .from("meetings")
    .select("created_by, host_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meeting as { created_by?: string | null; host_user_id?: string | null } | null;
  if (!m) return false;
  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  if (host === uid) return true;
  const { data: row } = await sb
    .from("meeting_members")
    .select("status")
    .eq("meeting_id", meetingId)
    .eq("user_id", uid)
    .eq("status", "joined")
    .maybeSingle();
  if ((row as { status?: string } | null)?.status) return true;
  return isUserPlatformAdminDb(sb, uid);
}
