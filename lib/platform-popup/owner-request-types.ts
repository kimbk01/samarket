/**
 * CUT 5 — Owner paid Platform Popup request types (NOT the campaign).
 * payment_status != admin approval. One request → max one campaign.
 */

import type {
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export const PLATFORM_POPUP_OWNER_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revision_required",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type PlatformPopupOwnerRequestStatus =
  (typeof PLATFORM_POPUP_OWNER_REQUEST_STATUSES)[number];

export const PLATFORM_POPUP_OWNER_PAYMENT_STATUSES = [
  "unfunded",
  "funded",
  "refunded",
  "failed",
] as const;
export type PlatformPopupOwnerPaymentStatus =
  (typeof PLATFORM_POPUP_OWNER_PAYMENT_STATUSES)[number];

export const PLATFORM_POPUP_OWNER_REQUEST_ADMIN_ACTIONS = [
  "approve",
  "reject",
  "revision_required",
  "start_review",
] as const;
export type PlatformPopupOwnerRequestAdminAction =
  (typeof PLATFORM_POPUP_OWNER_REQUEST_ADMIN_ACTIONS)[number];

export type PlatformPopupAdPackageRow = {
  id: string;
  code: string;
  name: string;
  currency: "BUSINESS_CASH";
  priceMinor: number;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
};

export type PlatformPopupOwnerRequestRow = {
  id: string;
  ownerUserId: string;
  storeId: string;
  requestStatus: PlatformPopupOwnerRequestStatus;
  paymentStatus: PlatformPopupOwnerPaymentStatus;
  packageId: string | null;
  priceMinor: number | null;
  currency: "BUSINESS_CASH";
  requestedSurfaces: PlatformPopupTargetSurface[];
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  timezone: string;
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  suppressionMode: PlatformPopupSuppressionMode;
  suppressionDurationSeconds: number | null;
  creativeAssetPath: string | null;
  creativeAssetUrl: string | null;
  creativeAltText: string | null;
  revisionReason: string | null;
  rejectionReason: string | null;
  adminCampaignId: string | null;
  submitIdempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
};

export function isPlatformPopupOwnerRequestStatus(
  v: string
): v is PlatformPopupOwnerRequestStatus {
  return (PLATFORM_POPUP_OWNER_REQUEST_STATUSES as readonly string[]).includes(v);
}

export function isPlatformPopupOwnerPaymentStatus(
  v: string
): v is PlatformPopupOwnerPaymentStatus {
  return (PLATFORM_POPUP_OWNER_PAYMENT_STATUSES as readonly string[]).includes(v);
}

export function isPlatformPopupOwnerRequestAdminAction(
  v: string
): v is PlatformPopupOwnerRequestAdminAction {
  return (PLATFORM_POPUP_OWNER_REQUEST_ADMIN_ACTIONS as readonly string[]).includes(v);
}
