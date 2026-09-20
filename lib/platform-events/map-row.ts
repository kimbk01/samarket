import { normalizePlatformEventSections } from "@/lib/platform-events/sections";
import {
  isPlatformEventStatus,
  type PlatformEventRow,
  type PlatformEventStatus,
} from "@/lib/platform-events/types";

export type PlatformEventDbRow = {
  id: string;
  title: string;
  subtitle: string | null;
  hero_image_url: string | null;
  hero_image_path: string | null;
  sections: unknown;
  terms: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  cta_label: string | null;
  cta_type: string | null;
  cta_target: string | null;
  cta_external_url: string | null;
  published_at: string | null;
  source_owner_request_id?: string | null;
  source_store_id?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function mapPlatformEventDbRow(row: PlatformEventDbRow): PlatformEventRow {
  const status: PlatformEventStatus = isPlatformEventStatus(row.status) ? row.status : "draft";
  return {
    id: row.id,
    title: String(row.title ?? "").trim(),
    subtitle: row.subtitle?.trim() || null,
    heroImageUrl: row.hero_image_url?.trim() || null,
    heroImagePath: row.hero_image_path?.trim() || null,
    sections: normalizePlatformEventSections(row.sections),
    terms: row.terms?.trim() || null,
    status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone?.trim() || "Asia/Manila",
    ctaLabel: row.cta_label?.trim() || null,
    ctaType: row.cta_type?.trim() || null,
    ctaTarget: String(row.cta_target ?? "").trim(),
    ctaExternalUrl: row.cta_external_url?.trim() || null,
    publishedAt: row.published_at,
    sourceOwnerRequestId: row.source_owner_request_id
      ? String(row.source_owner_request_id)
      : null,
    sourceStoreId: row.source_store_id ? String(row.source_store_id) : null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
