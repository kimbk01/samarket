import type { SupabaseClient } from "@supabase/supabase-js";
import { channelSummaryFromDistributionRows } from "@/lib/admin/promotion-ownership-visibility";
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

/** Batch Dist rows for Admin Event list channel summaries. */
export async function listDistributionsForEvents(
  sb: SupabaseClient,
  eventIds: string[]
): Promise<PromotionDistributionRow[]> {
  const ids = [...new Set(eventIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await sb
    .from("platform_promotion_distributions")
    .select("*")
    .eq("content_type", "platform_event")
    .in("content_id", ids)
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

export function channelSummaryFromToggles(
  toggles: PromotionDistributionToggleDraft,
  lang: "ko" | "en" = "ko"
): string {
  const labels =
    lang === "en"
      ? ({ popup: "Popup", banner: "Banner", push: "Push", bell: "Bell" } as const)
      : ({ popup: "팝업", banner: "배너", push: "Push", bell: "앱 알림" } as const);
  const on = (["popup", "banner", "push", "bell"] as const)
    .filter((k) => toggles[k])
    .map((k) => labels[k]);
  if (on.length === 0) return lang === "en" ? "No channels" : "채널 없음";
  return on.join(" · ");
}

/**
 * Prefer Dist rows when available so Inline vs Hero is visible on Event list.
 */
export function channelSummaryFromDistributionRowsPreferringPresentation(
  rows: PromotionDistributionRow[],
  lang: "ko" | "en" = "ko"
): string {
  if (rows.length === 0) return channelSummaryFromToggles(emptyDistributionToggles(), lang);
  return channelSummaryFromDistributionRows(rows, lang);
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
