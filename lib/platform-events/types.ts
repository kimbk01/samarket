/**
 * Platform Event content SSOT (Phase 2).
 * Popup / Banner / Push / Bell distribute — they do not own Event body.
 */

export const PLATFORM_EVENT_STATUSES = ["draft", "published", "unpublished"] as const;
export type PlatformEventStatus = (typeof PLATFORM_EVENT_STATUSES)[number];

export const PLATFORM_EVENT_DEFAULT_TIMEZONE = "Asia/Manila" as const;

/** Structured sections — no arbitrary HTML CMS. */
export const PLATFORM_EVENT_SECTION_TYPES = [
  "text",
  "image",
  "benefit",
  "cta",
  "terms",
] as const;
export type PlatformEventSectionType = (typeof PLATFORM_EVENT_SECTION_TYPES)[number];

export type PlatformEventTextSection = {
  type: "text";
  title?: string;
  body: string;
};

export type PlatformEventImageSection = {
  type: "image";
  imageUrl: string;
  alt?: string;
};

export type PlatformEventBenefitSection = {
  type: "benefit";
  title: string;
  body?: string;
};

export type PlatformEventCtaSection = {
  type: "cta";
  label: string;
  ctaType: string;
  ctaTarget?: string;
  externalUrl?: string;
};

export type PlatformEventTermsSection = {
  type: "terms";
  body: string;
};

export type PlatformEventSection =
  | PlatformEventTextSection
  | PlatformEventImageSection
  | PlatformEventBenefitSection
  | PlatformEventCtaSection
  | PlatformEventTermsSection;

export type PlatformEventRow = {
  id: string;
  title: string;
  subtitle: string | null;
  heroImageUrl: string | null;
  heroImagePath: string | null;
  sections: PlatformEventSection[];
  terms: string | null;
  status: PlatformEventStatus;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  ctaLabel: string | null;
  ctaType: string | null;
  ctaTarget: string;
  ctaExternalUrl: string | null;
  publishedAt: string | null;
  sourceOwnerRequestId: string | null;
  sourceStoreId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const PLATFORM_EVENTS_SELECT =
  "id, title, subtitle, hero_image_url, hero_image_path, sections, terms, status, starts_at, ends_at, timezone, cta_label, cta_type, cta_target, cta_external_url, published_at, source_owner_request_id, source_store_id, created_by, updated_by, created_at, updated_at";

export function isPlatformEventStatus(v: string): v is PlatformEventStatus {
  return (PLATFORM_EVENT_STATUSES as readonly string[]).includes(v);
}

export function buildPlatformEventDetailPath(eventId: string): string {
  const id = String(eventId ?? "").trim();
  if (!id) return "/events";
  return `/events/${encodeURIComponent(id)}`;
}
