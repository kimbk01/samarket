import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftAdminEventEntityType =
  | "product"
  | "instance"
  | "application"
  | "cash_out"
  | "conversion"
  | "recovery"
  | "redemption"
  | "system";

export async function recordGiftAdminEvent(
  sb: SupabaseClient,
  input: {
    entityType: GiftAdminEventEntityType;
    entityId: string;
    eventType: string;
    operatorId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    reference?: string | null;
  }
): Promise<void> {
  const entityId = input.entityId.trim();
  const eventType = input.eventType.trim();
  if (!entityId || !eventType) return;
  try {
    await sb.from(GIFT_TABLES.adminEvents).insert({
      entity_type: input.entityType,
      entity_id: entityId,
      event_type: eventType,
      operator_id: input.operatorId?.trim() || null,
      reason: input.reason?.trim() || null,
      before_json: input.before ?? null,
      after_json: input.after ?? null,
      reference: input.reference?.trim() || null,
    });
  } catch {
    // Audit must not break primary mutation; interim until table exists in all envs.
  }
}
