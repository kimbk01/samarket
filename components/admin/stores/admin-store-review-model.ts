import type { MessageKey } from "@/lib/i18n/messages";
import {
  parseStoredAddressBookPresentation,
  type AddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";

export type AdminStoreReviewRow = {
  id: string;
  store_name: string;
  slug: string;
  owner_user_id: string;
  applicant_nickname?: string | null;
  owner_username?: string | null;
  owner_handle?: string | null;
  approval_status: string;
  is_visible: boolean;
  business_type: string | null;
  store_category_id?: string | null;
  store_topic_id?: string | null;
  owner_can_edit_store_identity?: boolean;
  store_categories?: TaxonomyRelation | TaxonomyRelation[] | null;
  store_topics?: TaxonomyRelation | TaxonomyRelation[] | null;
  description: string | null;
  application_request_note?: string | null;
  /** 신청 시점 주소록 카드 — `{ gatePrefix, streetBody }` */
  application_address_book?: AddressBookCardPresentation | null;
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
  updated_at?: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  revision_note: string | null;
  suspended_reason: string | null;
};

export type TaxonomyRelation = {
  name?: string | null;
  name_en?: string | null;
  slug?: string | null;
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

export function formatAdminEnglishDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** `/mypage/addresses` 카드와 동일 — 신청 스냅샷 우선 */
export function formatAdminStoreAddressPresentation(
  r: AdminStoreReviewRow
): AddressBookCardPresentation | null {
  const fromRow = parseStoredAddressBookPresentation(r.application_address_book);
  if (fromRow) return fromRow;
  return null;
}

export type AdminStoreDateRow = { label: string; value: string };

/** 신청·승인·최종변경 등 처리 일시 — 행 단위 목록 */
export function buildAdminStoreDateRows(r: AdminStoreReviewRow): AdminStoreDateRow[] {
  const rows: AdminStoreDateRow[] = [
    { label: "신청일", value: formatAdminEnglishDate(r.created_at) },
  ];
  if (r.approved_at) {
    rows.push({ label: "승인일", value: formatAdminEnglishDate(r.approved_at) });
  }
  const updated = (r.updated_at ?? "").trim();
  const created = (r.created_at ?? "").trim();
  if (updated && updated !== created) {
    rows.push({ label: "최종변경", value: formatAdminEnglishDate(updated) });
  }
  return rows;
}
