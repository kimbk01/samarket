/**
 * Phase 3-1 — Legacy → Engine adapter (RoomRead).
 *
 * Parallel shadow + Persistence Consumer (notification_targets clear).
 * Legacy mark_read / target bridge remains authoritative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGroupMessageRoomKind } from "@/lib/community-messenger/group/group-room-notification-policy";
import type { CmNotificationRoomKind } from "@/lib/notifications/engine/notification-event";
import {
  logNotificationEngineShadowResult,
  runNotificationEngine,
} from "@/lib/notifications/engine/notification-engine";
import { buildLegacyRoomReadPersistencePlan } from "@/lib/notifications/engine/persistence/legacy-room-read-persistence-plan";
import { runEnginePersistencePipeline } from "@/lib/notifications/engine/run-engine-persistence-pipeline";

export type LegacyRoomReadNotificationEngineAdapterInput = {
  userId: string;
  roomId: string;
  lastReadMessageId?: string | null;
  readAt?: string;
  roomType?: string | null;
  directKey?: string | null;
  causation?: string;
};

async function resolveRoomKindForAdapter(
  sb: SupabaseClient<any> | null | undefined,
  roomId: string,
  roomType?: string | null,
  directKey?: string | null
): Promise<CmNotificationRoomKind | null> {
  const fromInput = resolveGroupMessageRoomKind(String(roomType ?? ""), directKey ?? null);
  if (fromInput === "direct" || fromInput === "group") return fromInput;

  if (!sb) return null;
  const { data } = await sb
    .from("community_messenger_rooms")
    .select("room_type, direct_key")
    .eq("id", roomId)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const row = data as { room_type?: unknown; direct_key?: unknown };
  const rt = typeof row.room_type === "string" ? row.room_type : "";
  const dk = typeof row.direct_key === "string" ? row.direct_key : null;
  const kind = resolveGroupMessageRoomKind(rt, dk);
  if (kind === "direct" || kind === "group") return kind;
  return null;
}

export async function runLegacyRoomReadNotificationEngineAdapter(
  sb: SupabaseClient<any> | null | undefined,
  input: LegacyRoomReadNotificationEngineAdapterInput
): Promise<void> {
  const userId = input.userId.trim();
  const roomId = input.roomId.trim();
  if (!userId || !roomId) return;

  const roomKind = await resolveRoomKindForAdapter(sb, roomId, input.roomType, input.directKey ?? null);
  if (!roomKind) return;

  const result = await runNotificationEngine(
    {
      kind: "room_read",
      roomId,
      userId,
      readAt: input.readAt ?? new Date().toISOString(),
      lastReadMessageId: input.lastReadMessageId ?? null,
      roomKind,
      causation: input.causation ?? "legacy_room_read",
    },
    { sb: sb ?? null }
  );
  if (!result) return;

  logNotificationEngineShadowResult(result, "legacy_room_read");

  const legacyPlan = buildLegacyRoomReadPersistencePlan({
    userId,
    roomId,
    scope: "mark_read_patch",
  });

  await runEnginePersistencePipeline({
    sb: sb ?? null,
    result,
    phase: "room_read",
    legacyPlan,
    source: "legacy_room_read_target_clear",
    roomReadScope: "mark_read_patch",
  });
}
