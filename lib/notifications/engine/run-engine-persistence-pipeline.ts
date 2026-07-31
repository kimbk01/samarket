/**
 * Phase 3-1 — Engine shadow pipeline: Event Log → plan → compare.
 *
 * Live persistence belongs to the legacy/canonical notification pipeline.
 * The Engine must never become a second writer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistenceConsumerMessageDisplayInput } from "@/lib/notifications/engine/consumers/persistence-consumer";
import type { NotificationEngineResult } from "@/lib/notifications/engine/notification-engine";
import { appendNotificationEventLog } from "@/lib/notifications/engine/notification-event-log";
import {
  buildEnginePersistencePlan,
  type EnginePersistencePhase,
} from "@/lib/notifications/engine/persistence/engine-persistence-plan";
import type { LegacyRoomReadPersistenceScope } from "@/lib/notifications/engine/persistence/legacy-room-read-persistence-plan";
import type { PersistencePlan } from "@/lib/notifications/engine/persistence/persistence-operation";
import {
  comparePersistencePlans,
  logPersistenceShadowCompareResult,
  type PersistenceShadowCompareResult,
} from "@/lib/notifications/engine/persistence/persistence-shadow-compare";

export type RunEnginePersistencePipelineInput = {
  sb: SupabaseClient<any> | null | undefined;
  result: NotificationEngineResult;
  phase: EnginePersistencePhase;
  legacyPlan: PersistencePlan | null;
  source: string;
  roomReadScope?: LegacyRoomReadPersistenceScope;
  displayInput?: PersistenceConsumerMessageDisplayInput;
};

export type RunEnginePersistencePipelineOutcome = {
  logSeq: number | null;
  compare: PersistenceShadowCompareResult;
  executed: boolean;
};

export async function runEnginePersistencePipeline(
  input: RunEnginePersistencePipelineInput
): Promise<RunEnginePersistencePipelineOutcome> {
  const logEntry = await appendNotificationEventLog(input.result.event, "live");
  const enginePlan = buildEnginePersistencePlan(
    input.result.event,
    input.phase,
    input.roomReadScope ?? "mark_read_patch"
  );
  const compare = comparePersistencePlans(input.legacyPlan, enginePlan);

  logPersistenceShadowCompareResult(compare, input.source, {
    phase: input.phase,
    eventId: input.result.event.eventId,
    eventType: input.result.event.type,
    roomId: input.result.event.roomId,
    userId: input.result.event.userId,
    logSeq: logEntry.seq,
  });

  return { logSeq: logEntry.seq, compare, executed: false };
}
