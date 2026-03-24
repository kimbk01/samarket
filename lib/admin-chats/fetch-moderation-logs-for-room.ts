import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import type { ChatModerationLog } from "@/lib/types/admin-chat";

type NicknameSb = Parameters<typeof fetchNicknamesForUserIds>[0];

export async function fetchModerationLogsForRoom(
  sbAny: SupabaseClient<any>,
  effectiveRoomId: string
): Promise<ChatModerationLog[]> {
  try {
    const { data, error } = await sbAny
      .from("moderation_actions")
      .select("id, action_type, action_reason, action_note, actor_admin_id, created_at")
      .eq("target_type", "room")
      .eq("target_id", effectiveRoomId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return [];
    const rows = (data ?? []) as Array<{
      id: string;
      action_type: string;
      action_reason?: string | null;
      action_note?: string | null;
      actor_admin_id: string | null;
      created_at: string;
    }>;
    const ids = [...new Set(rows.map((r) => r.actor_admin_id).filter(Boolean))] as string[];
    const nickMap = await fetchNicknamesForUserIds(sbAny as unknown as NicknameSb, ids);
    return rows.map((m) => ({
      id: m.id,
      roomId: effectiveRoomId,
      actionType: m.action_type,
      adminId: m.actor_admin_id ?? "",
      adminNickname: m.actor_admin_id
        ? nickMap.get(m.actor_admin_id) ?? m.actor_admin_id.slice(0, 8)
        : "—",
      note: [m.action_reason, m.action_note].filter((x) => x && String(x).trim()).join(" · "),
      createdAt: m.created_at,
    }));
  } catch {
    return [];
  }
}
