/**
 * Phase 3-1 — Legacy → Engine adapter (MessageCreated).
 *
 * Parallel shadow + Persistence Consumer (notification_events).
 * Legacy notifyMessagePipeline remains authoritative.
 *
 * Shadow compare uses T0 Legacy Decision Snapshot only (no T2 presence re-read).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGroupMessageRoomKind } from "@/lib/community-messenger/group/group-room-notification-policy";
import type { CommunityMessengerSendPostAckEffects } from "@/lib/community-messenger/server/community-messenger-send-post-ack-effects";
import { cmMessagePreviewFallback } from "@/lib/community-messenger/cm-service-copy";
import type { CmNotificationRoomKind } from "@/lib/notifications/engine/notification-event";
import {
  logNotificationEngineShadowResult,
  runNotificationEngine,
} from "@/lib/notifications/engine/notification-engine";
import { buildEnginePersistencePlan } from "@/lib/notifications/engine/persistence/engine-persistence-plan";
import { runEnginePersistencePipeline } from "@/lib/notifications/engine/run-engine-persistence-pipeline";

function toCmNotificationRoomKind(
  roomType: string | null | undefined,
  directKey: string | null | undefined
): CmNotificationRoomKind | null {
  const kind = resolveGroupMessageRoomKind(String(roomType ?? ""), directKey ?? null);
  if (kind === "direct" || kind === "group") return kind;
  return null;
}

export async function runLegacyMessageCreatedNotificationEngineAdapter(
  sb: SupabaseClient<any> | null | undefined,
  effects: CommunityMessengerSendPostAckEffects
): Promise<void> {
  const roomId = effects.roomId.trim();
  const messageId = effects.messageId.trim();
  const senderUserId = effects.senderUserId.trim();
  const createdAt = effects.createdAt;
  if (!roomId || !messageId || !senderUserId) return;

  const roomKind = toCmNotificationRoomKind(effects.roomType ?? null, effects.directKey ?? null);
  if (!roomKind) return;

  const recipients = [...new Set(effects.recipientUserIds.map((id) => id.trim()).filter(Boolean))];
  const preview = cmMessagePreviewFallback(effects.content);
  const snapshots = effects.decisionSnapshotsByRecipientId ?? {};

  for (const recipientUserId of recipients) {
    if (!recipientUserId || recipientUserId === senderUserId) continue;

    const decisionSnapshot = snapshots[recipientUserId];
    if (!decisionSnapshot) continue;

    const result = await runNotificationEngine(
      {
        kind: "message_created",
        messageId,
        roomId,
        senderUserId,
        recipientUserId,
        createdAt,
        roomKind,
        causation: "legacy_post_ack_message_created",
        decisionSnapshot,
      },
      { sb: sb ?? null }
    );
    if (!result) continue;

    logNotificationEngineShadowResult(result, "legacy_message_created");

    if (!sb) continue;

    // Same f(T0 Decision Snapshot) for both sides — no T2 fresh re-read.
    const planFromT0 = buildEnginePersistencePlan(result.event, "message_event");

    await runEnginePersistencePipeline({
      sb,
      result,
      phase: "message_event",
      legacyPlan: planFromT0,
      source: "legacy_message_created_event",
      displayInput: {
        senderUserId,
        preview,
        directKey: effects.directKey ?? null,
      },
    });
  }
}
