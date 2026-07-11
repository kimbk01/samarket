/**
 * Phase 3-1 — Legacy → Engine adapter (target bump after room mutation).
 *
 * Parallel shadow + Persistence Consumer (notification_targets bump).
 * Legacy bumpMessengerRoomTargetsForRecipients remains authoritative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGroupMessageRoomKind } from "@/lib/community-messenger/group/group-room-notification-policy";
import type { CmNotificationRoomKind } from "@/lib/notifications/engine/notification-event";
import { runNotificationEngine } from "@/lib/notifications/engine/notification-engine";
import {
  buildLegacyMessageTargetBumpPersistencePlan,
} from "@/lib/notifications/engine/persistence/legacy-message-persistence-plan";
import { runEnginePersistencePipeline } from "@/lib/notifications/engine/run-engine-persistence-pipeline";

export type LegacyTargetBumpNotificationEngineAdapterInput = {
  roomId: string;
  fromUserId: string;
  recipientUserIds: string[];
  messageId?: string | null;
  messageCreatedAt?: string | null;
  roomType?: string | null;
  directKey?: string | null;
};

function toCmNotificationRoomKind(
  roomType: string | null | undefined,
  directKey: string | null | undefined
): CmNotificationRoomKind | null {
  const kind = resolveGroupMessageRoomKind(String(roomType ?? ""), directKey ?? null);
  if (kind === "direct" || kind === "group") return kind;
  return null;
}

export async function runLegacyTargetBumpNotificationEngineAdapter(
  sb: SupabaseClient<any> | null | undefined,
  input: LegacyTargetBumpNotificationEngineAdapterInput
): Promise<void> {
  const roomId = input.roomId.trim();
  const fromUserId = input.fromUserId.trim();
  const messageId = input.messageId?.trim() ?? "";
  if (!roomId || !fromUserId) return;

  const roomKind = toCmNotificationRoomKind(input.roomType ?? null, input.directKey ?? null);
  if (!roomKind) return;

  const createdAt = input.messageCreatedAt?.trim() || new Date().toISOString();
  const recipients = [...new Set(input.recipientUserIds.map((id) => id.trim()).filter(Boolean))];

  for (const recipientUserId of recipients) {
    if (!recipientUserId || recipientUserId === fromUserId) continue;

    const result = await runNotificationEngine(
      {
        kind: "message_created",
        messageId: messageId || `target-bump:${roomId}:${createdAt}`,
        roomId,
        senderUserId: fromUserId,
        recipientUserId,
        createdAt,
        roomKind,
        causation: "legacy_target_bump_after_mutation",
      },
      { sb: sb ?? null }
    );
    if (!result) continue;

    const legacyPlan = buildLegacyMessageTargetBumpPersistencePlan({
      roomId,
      recipientUserId,
    });

    await runEnginePersistencePipeline({
      sb: sb ?? null,
      result,
      phase: "message_target",
      legacyPlan,
      source: "legacy_target_bump",
    });
  }
}
