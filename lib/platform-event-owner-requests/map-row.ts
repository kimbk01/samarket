import type {
  PlatformEventOwnerDestinationType,
  PlatformEventOwnerRequestRow,
  PlatformEventOwnerRequestStatus,
} from "@/lib/platform-event-owner-requests/types";

export type PlatformEventOwnerRequestDbRow = {
  id: string;
  owner_user_id: string;
  store_id: string;
  request_status: string;
  title: string;
  subtitle: string | null;
  hero_image_url: string | null;
  hero_image_path: string | null;
  body: string | null;
  benefit_title: string | null;
  benefit_body: string | null;
  requested_starts_at: string | null;
  requested_ends_at: string | null;
  timezone: string;
  destination_type: string;
  destination_target: string;
  requested_popup: boolean;
  requested_banner: boolean;
  requested_push: boolean;
  requested_bell: boolean;
  rejection_reason: string | null;
  revision_reason: string | null;
  platform_event_id: string | null;
  approve_idempotency_key: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export function mapPlatformEventOwnerRequestDbRow(
  row: PlatformEventOwnerRequestDbRow
): PlatformEventOwnerRequestRow {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    storeId: String(row.store_id),
    requestStatus: row.request_status as PlatformEventOwnerRequestStatus,
    title: String(row.title ?? ""),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    heroImageUrl: row.hero_image_url ? String(row.hero_image_url) : null,
    heroImagePath: row.hero_image_path ? String(row.hero_image_path) : null,
    body: row.body ? String(row.body) : null,
    benefitTitle: row.benefit_title ? String(row.benefit_title) : null,
    benefitBody: row.benefit_body ? String(row.benefit_body) : null,
    requestedStartsAt: row.requested_starts_at ? String(row.requested_starts_at) : null,
    requestedEndsAt: row.requested_ends_at ? String(row.requested_ends_at) : null,
    timezone: String(row.timezone || "Asia/Manila"),
    destinationType: row.destination_type as PlatformEventOwnerDestinationType,
    destinationTarget: String(row.destination_target ?? ""),
    requestedChannels: {
      popup: Boolean(row.requested_popup),
      banner: Boolean(row.requested_banner),
      push: Boolean(row.requested_push),
      bell: Boolean(row.requested_bell),
    },
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    revisionReason: row.revision_reason ? String(row.revision_reason) : null,
    platformEventId: row.platform_event_id ? String(row.platform_event_id) : null,
    approveIdempotencyKey: row.approve_idempotency_key
      ? String(row.approve_idempotency_key)
      : null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const PLATFORM_EVENT_OWNER_REQUEST_TABLE = "platform_event_owner_requests";
