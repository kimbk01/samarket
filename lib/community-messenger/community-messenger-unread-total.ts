import type { SupabaseClient } from "@supabase/supabase-js";

const CM_UNREAD_PAGE = 1000;

/**
 * 하단 「메신저」탭 배지용 — `community_messenger_participants.unread_count` 합.
 *
 * PostgREST `unread_count.sum()` 응답 키·집계 활성화 여부에 따라 0으로만 잘못 파싱될 수 있어,
 * **행 unread만 합산**한다(페이지네이션으로 1000행 초과도 누락 없음). 리스트·DB와 동일 SSOT.
 */
export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  let sum = 0;
  let from = 0;
  for (;;) {
    const to = from + CM_UNREAD_PAGE - 1;
    const { data, error } = await sbAny
      .from("community_messenger_participants")
      .select("unread_count")
      .eq("user_id", uid)
      .range(from, to);
    if (error) {
      if (from === 0) return 0;
      break;
    }
    const rows = (data ?? []) as { unread_count?: unknown }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const n = Number(row.unread_count ?? 0);
      if (Number.isFinite(n)) sum += Math.max(0, n);
    }
    if (rows.length < CM_UNREAD_PAGE) break;
    from += CM_UNREAD_PAGE;
  }
  return sum;
}
