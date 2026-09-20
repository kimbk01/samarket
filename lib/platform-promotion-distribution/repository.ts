import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapPromotionDistributionDbRow,
  type PromotionDistributionDbRow,
} from "@/lib/platform-promotion-distribution/map-row";
import type {
  PromotionDistributionChannel,
  PromotionDistributionRow,
  PromotionDistributionToggleDraft,
} from "@/lib/platform-promotion-distribution/types";
import { emptyDistributionToggles } from "@/lib/platform-promotion-distribution/types";

export async function listDistributionsForEvent(
  sb: SupabaseClient,
  eventId: string
): Promise<PromotionDistributionRow[]> {
  const { data, error } = await sb
    .from("platform_promotion_distributions")
    .select("*")
    .eq("content_type", "platform_event")
    .eq("content_id", eventId)
    .order("channel", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PromotionDistributionDbRow[]).map(mapPromotionDistributionDbRow);
}

export function distributionsToToggles(
  rows: PromotionDistributionRow[]
): PromotionDistributionToggleDraft {
  const t = emptyDistributionToggles();
  for (const row of rows) {
    if (row.enabled) t[row.channel] = true;
  }
  return t;
}

export type UpsertDistributionInput = {
  eventId: string;
  channel: PromotionDistributionChannel;
  enabled: boolean;
  config?: Record<string, unknown>;
  channelRefType?: string | null;
  channelRefId?: string | null;
  adminUserId: string;
};

/**
 * Upsert one channel orchestration row.
 * Does NOT call Push send / Bell createNotificationEvent.
 */
export async function upsertEventChannelDistribution(
  sb: SupabaseClient,
  input: UpsertDistributionInput
): Promise<PromotionDistributionRow> {
  const status = input.enabled ? "configured" : "disabled";
  const payload = {
    content_type: "platform_event",
    content_id: input.eventId,
    channel: input.channel,
    enabled: input.enabled,
    status,
    config: input.config ?? {},
    channel_ref_type: input.channelRefType ?? null,
    channel_ref_id: input.channelRefId ?? null,
    updated_by: input.adminUserId,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from("platform_promotion_distributions")
    .select("id")
    .eq("content_type", "platform_event")
    .eq("content_id", input.eventId)
    .eq("channel", input.channel)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await sb
      .from("platform_promotion_distributions")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPromotionDistributionDbRow(data as PromotionDistributionDbRow);
  }

  const { data, error } = await sb
    .from("platform_promotion_distributions")
    .insert({
      ...payload,
      created_by: input.adminUserId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapPromotionDistributionDbRow(data as PromotionDistributionDbRow);
}
