/**
 * Phase 3 S2-2 Ghost Admin — Invisible Read Only on Admin Console lane.
 * CONTRACT:
 * - Platform Admin only (caller must already pass requireAdminApiUser)
 * - Never insert/update community_messenger_participants for the admin
 * - Never touch presence / typing / read cursor / badge / notification
 * - Audit only: community_messenger.ghost_enter | community_messenger.ghost_exit
 * - No Ghost Store / Engine / EventBus / Participant table
 */
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const GHOST_AUDIT_ACTION_ENTER = "community_messenger.ghost_enter";
export const GHOST_AUDIT_ACTION_EXIT = "community_messenger.ghost_exit";
export const GHOST_AUDIT_TARGET_TYPE = "community_messenger_room";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sb() {
  return getSupabaseServer();
}

export type GhostSessionResult =
  | { ok: true; roomId: string; action: "enter" | "exit"; at: string }
  | { ok: false; error: string };

/**
 * Count participant rows for regression probes (includes left). Active = left_at IS NULL.
 */
export async function countRoomParticipantsForGhostProbe(roomId: string): Promise<{
  total: number;
  active: number;
}> {
  const rid = trimText(roomId);
  if (!rid) return { total: 0, active: 0 };
  const client = sb() as any;
  const [{ count: total }, { count: active }] = await Promise.all([
    client
      .from("community_messenger_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid),
    client
      .from("community_messenger_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", rid)
      .is("left_at", null),
  ]);
  return { total: Number(total ?? 0), active: Number(active ?? 0) };
}

async function assertRoomExists(roomId: string): Promise<boolean> {
  const { data } = await (sb() as any)
    .from("community_messenger_rooms")
    .select("id")
    .eq("id", roomId)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Ghost enter — audit only. Does not create participant / presence / read cursor.
 */
export async function enterGhostRoom(input: {
  adminUserId: string;
  roomId: string;
  reason?: string | null;
}): Promise<GhostSessionResult> {
  const adminUserId = trimText(input.adminUserId);
  const roomId = trimText(input.roomId);
  if (!adminUserId) return { ok: false, error: "forbidden" };
  if (!roomId) return { ok: false, error: "room_not_found" };
  if (!(await assertRoomExists(roomId))) return { ok: false, error: "room_not_found" };

  const at = new Date().toISOString();
  await appendAuditLog(sb() as any, {
    actor_type: "admin",
    actor_id: adminUserId,
    target_type: GHOST_AUDIT_TARGET_TYPE,
    target_id: roomId,
    action: GHOST_AUDIT_ACTION_ENTER,
    after_json: {
      roomId,
      enteredAt: at,
      reason: trimText(input.reason) || null,
      mode: "invisible_read_only",
    },
  });
  return { ok: true, roomId, action: "enter", at };
}

/**
 * Ghost exit — audit only.
 */
export async function exitGhostRoom(input: {
  adminUserId: string;
  roomId: string;
  reason?: string | null;
}): Promise<GhostSessionResult> {
  const adminUserId = trimText(input.adminUserId);
  const roomId = trimText(input.roomId);
  if (!adminUserId) return { ok: false, error: "forbidden" };
  if (!roomId) return { ok: false, error: "room_not_found" };
  if (!(await assertRoomExists(roomId))) return { ok: false, error: "room_not_found" };

  const at = new Date().toISOString();
  await appendAuditLog(sb() as any, {
    actor_type: "admin",
    actor_id: adminUserId,
    target_type: GHOST_AUDIT_TARGET_TYPE,
    target_id: roomId,
    action: GHOST_AUDIT_ACTION_EXIT,
    after_json: {
      roomId,
      exitedAt: at,
      reason: trimText(input.reason) || null,
      mode: "invisible_read_only",
    },
  });
  return { ok: true, roomId, action: "exit", at };
}

export type GhostAuditRow = {
  id: string;
  action: string;
  actorId: string | null;
  createdAt: string;
  reason: string | null;
  enteredAt: string | null;
  exitedAt: string | null;
};

export async function listGhostAuditsForRoom(roomId: string, limit = 40): Promise<GhostAuditRow[]> {
  const rid = trimText(roomId);
  if (!rid) return [];
  const { data } = await (sb() as any)
    .from("audit_logs")
    .select("id, actor_id, action, after_json, created_at")
    .eq("target_type", GHOST_AUDIT_TARGET_TYPE)
    .eq("target_id", rid)
    .in("action", [GHOST_AUDIT_ACTION_ENTER, GHOST_AUDIT_ACTION_EXIT])
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const after = (row.after_json ?? {}) as Record<string, unknown>;
    return {
      id: trimText(row.id),
      action: trimText(row.action),
      actorId: trimText(row.actor_id) || null,
      createdAt: trimText(row.created_at),
      reason: trimText(after.reason) || null,
      enteredAt: trimText(after.enteredAt) || null,
      exitedAt: trimText(after.exitedAt) || null,
    };
  });
}
