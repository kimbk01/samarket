/**
 * DIBAY Delivery Ads — Owner UI presentation (design board SSOT).
 * Visual only — no commercial authority mutation.
 */

import {
  DELIVERY_AD_DESIGN_BOARD,
  DELIVERY_AD_OWNER_HUB_CONTRACT,
} from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { OwnerAdsSummaryBucket } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export { DELIVERY_AD_DESIGN_BOARD };

/** UI-1 action-first hub KPI — ended de-emphasized (not in above-fold row). */
export const DELIVERY_AD_OWNER_HUB_KPI_BUCKETS: readonly OwnerAdsSummaryBucket[] = [
  "changes_requested",
  "under_review",
  "scheduled",
  "active",
  "paused",
] as const;

void DELIVERY_AD_OWNER_HUB_CONTRACT;

export type DeliveryAdOwnerStatusBadgeTone =
  | "green"
  | "blue"
  | "orange"
  | "red"
  | "grey";

export function ownerDeliveryAdStatusBadgeTone(
  status: DeliveryAdLifecycleStatus
): DeliveryAdOwnerStatusBadgeTone {
  switch (status) {
    case "ACTIVE":
      return "green";
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "APPROVED":
    case "SCHEDULED":
      return "blue";
    case "CHANGES_REQUESTED":
      return "orange";
    case "REJECTED":
      return "red";
    case "DRAFT":
      return "grey";
    case "PAUSED_OWNER":
    case "PAUSED_ADMIN":
    case "EXHAUSTED":
    case "ENDED":
    case "TERMINATED":
    case "ARCHIVED":
    default:
      return "grey";
  }
}

export const DELIVERY_AD_OWNER_STATUS_BADGE_CLASS: Record<
  DeliveryAdOwnerStatusBadgeTone,
  string
> = {
  green: "bg-[#0A823E]/12 text-[#0A823E] border-[#0A823E]/30",
  blue: "bg-[#2563eb]/10 text-[#1d4ed8] border-[#2563eb]/25",
  orange: "bg-[#FF8A00]/12 text-[#c56a00] border-[#FF8A00]/30",
  red: "bg-[#E53935]/10 text-[#E53935] border-[#E53935]/25",
  grey: "bg-[#F5F5F5] text-[#757575] border-[#BDBDBD]",
};

export const DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-1 rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#087a38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[14px] font-semibold text-sam-fg transition hover:bg-sam-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED =
  "border-[#0A823E] bg-[#0A823E]/8 ring-1 ring-[#0A823E]/40";

export const DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE =
  "border-[#BDBDBD] bg-white transition hover:border-[#0A823E]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99]";
