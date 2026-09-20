import type {
  PromotionChannelRefType,
  PromotionDistributionChannel,
  PromotionDistributionContentType,
  PromotionDistributionRow,
  PromotionDistributionStatus,
} from "@/lib/platform-promotion-distribution/types";

export type PromotionDistributionDbRow = {
  id: string;
  content_type: string;
  content_id: string;
  channel: string;
  enabled: boolean;
  status: string;
  channel_ref_type: string | null;
  channel_ref_id: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
};

export function mapPromotionDistributionDbRow(
  row: PromotionDistributionDbRow
): PromotionDistributionRow {
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    contentType: row.content_type as PromotionDistributionContentType,
    contentId: String(row.content_id),
    channel: row.channel as PromotionDistributionChannel,
    enabled: Boolean(row.enabled),
    status: row.status as PromotionDistributionStatus,
    channelRefType: (row.channel_ref_type as PromotionChannelRefType | null) ?? null,
    channelRefId: row.channel_ref_id ? String(row.channel_ref_id) : null,
    config,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
