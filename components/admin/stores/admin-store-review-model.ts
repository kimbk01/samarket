import type { MessageKey } from "@/lib/i18n/messages";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";

export type AdminStoreReviewRow = {
  id: string;
  store_name: string;
  slug: string;
  owner_user_id: string;
  applicant_nickname?: string | null;
  approval_status: string;
  is_visible: boolean;
  business_type: string | null;
  store_category_id?: string | null;
  store_topic_id?: string | null;
  owner_can_edit_store_identity?: boolean;
  store_categories?: { name?: string } | { name?: string }[] | null;
  store_topics?: { name?: string } | { name?: string }[] | null;
  description: string | null;
  kakao_id: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
  revision_note: string | null;
  suspended_reason: string | null;
};

export const ADMIN_STORE_APPROVAL_LABEL_KEYS: Record<string, MessageKey> = {
  pending: "admin_stores_approval_pending",
  under_review: "admin_stores_approval_under_review",
  revision_requested: "admin_stores_approval_revision_requested",
  approved: "admin_stores_approval_approved",
  rejected: "admin_stores_approval_rejected",
  suspended: "admin_stores_approval_suspended",
};

export const ADMIN_STORE_STATUS_FILTER: { value: string; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "admin_stores_filter_all" },
  { value: "pending", labelKey: "admin_stores_approval_pending" },
  { value: "under_review", labelKey: "admin_stores_approval_under_review" },
  { value: "revision_requested", labelKey: "admin_stores_approval_revision_requested" },
  { value: "approved", labelKey: "admin_stores_approval_approved" },
  { value: "rejected", labelKey: "admin_stores_approval_rejected" },
  { value: "suspended", labelKey: "admin_stores_approval_suspended" },
];

/** @deprecated use ADMIN_STORE_APPROVAL_LABEL_KEYS with useI18n */
export const ADMIN_STORE_APPROVAL_LABEL: Record<string, string> = {};

/** 신청 폼 기준: 주소 한 줄이 district·address_line1에 동기 저장 */
export function formatAdminStoreAddressOneLine(r: AdminStoreReviewRow): string {
  const lines = formatStorePickupAddressLines({
    region: r.region,
    city: r.city,
    district: r.district,
    address_line1: r.address_line1,
    address_line2: r.address_line2,
  });
  return lines.join(" · ").trim() || "—";
}
