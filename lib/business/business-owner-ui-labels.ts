import type { MessageKey } from "@/lib/i18n/messages";
import type { BusinessProfileStatus } from "@/lib/types/business";

export const BUSINESS_PROFILE_STATUS_KEYS: Record<BusinessProfileStatus, MessageKey> = {
  pending: "business_phase7_665",
  active: "business_phase7_666",
  paused: "business_phase7_667",
  rejected: "business_phase7_657",
};

export const STORE_APPROVAL_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "business_phase7_653",
  under_review: "business_phase7_654",
  revision_requested: "business_phase7_655",
  approved: "business_phase7_656",
  rejected: "business_phase7_657",
  suspended: "business_phase7_658",
};

export const STORE_SALES_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "business_phase7_659",
  approved: "business_phase7_660",
  rejected: "business_phase7_661",
  suspended: "business_phase7_662",
};

export const SETTLEMENT_STATUS_KEYS: Record<string, MessageKey> = {
  scheduled: "business_phase7_636",
  processing: "business_phase7_637",
  paid: "business_phase7_638",
  held: "business_phase7_639",
  cancelled: "business_phase7_640",
};
