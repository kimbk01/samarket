/**
 * Owner Event/Promotion REQUEST SSOT (OWNED promotion).
 * Not public Event. Not paid Ads. Not Distribution authority.
 */

export const PLATFORM_EVENT_OWNER_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revision_required",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type PlatformEventOwnerRequestStatus =
  (typeof PLATFORM_EVENT_OWNER_REQUEST_STATUSES)[number];

export const PLATFORM_EVENT_OWNER_ADMIN_ACTIONS = [
  "start_review",
  "approve",
  "reject",
  "revision_required",
] as const;
export type PlatformEventOwnerAdminAction =
  (typeof PLATFORM_EVENT_OWNER_ADMIN_ACTIONS)[number];

export const PLATFORM_EVENT_OWNER_DESTINATION_TYPES = [
  "store",
  "product",
  "internal_page",
  "external_url",
] as const;
export type PlatformEventOwnerDestinationType =
  (typeof PLATFORM_EVENT_OWNER_DESTINATION_TYPES)[number];

/** Suggested channels — never Admin final Distribution. */
export type PlatformEventOwnerRequestedChannels = {
  popup: boolean;
  banner: boolean;
  push: boolean;
  bell: boolean;
};

export type PlatformEventOwnerRequestRow = {
  id: string;
  ownerUserId: string;
  storeId: string;
  requestStatus: PlatformEventOwnerRequestStatus;
  title: string;
  subtitle: string | null;
  heroImageUrl: string | null;
  heroImagePath: string | null;
  body: string | null;
  benefitTitle: string | null;
  benefitBody: string | null;
  requestedStartsAt: string | null;
  requestedEndsAt: string | null;
  timezone: string;
  destinationType: PlatformEventOwnerDestinationType;
  destinationTarget: string;
  requestedChannels: PlatformEventOwnerRequestedChannels;
  rejectionReason: string | null;
  revisionReason: string | null;
  platformEventId: string | null;
  approveIdempotencyKey: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isPlatformEventOwnerRequestStatus(
  v: string
): v is PlatformEventOwnerRequestStatus {
  return (PLATFORM_EVENT_OWNER_REQUEST_STATUSES as readonly string[]).includes(v);
}

export function isPlatformEventOwnerAdminAction(
  v: string
): v is PlatformEventOwnerAdminAction {
  return (PLATFORM_EVENT_OWNER_ADMIN_ACTIONS as readonly string[]).includes(v);
}

/** Operator-facing labels (i18n keys live in catalog). */
export function ownerRequestStatusLabelKey(
  status: PlatformEventOwnerRequestStatus
): string {
  switch (status) {
    case "draft":
      return "owner_event_promo_status_draft";
    case "submitted":
    case "under_review":
      return "owner_event_promo_status_review";
    case "revision_required":
      return "owner_event_promo_status_revision";
    case "approved":
      return "owner_event_promo_status_approved";
    case "rejected":
      return "owner_event_promo_status_rejected";
    case "cancelled":
      return "owner_event_promo_status_cancelled";
  }
}
