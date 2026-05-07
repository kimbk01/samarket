"use client";

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

export const ADMIN_STORE_APPROVAL_LABEL: Record<string, string> = {
  pending: "신청대기",
  under_review: "검토중",
  revision_requested: "보완요청",
  approved: "승인",
  rejected: "반려",
  suspended: "정지",
};

/** 신청 폼 기준: 주소 한 줄이 district·address_line1에 동기 저장 */
export function formatAdminStoreAddressOneLine(r: AdminStoreReviewRow): string {
  const d = (r.district ?? "").trim();
  const a1 = (r.address_line1 ?? "").trim();
  const a2 = (r.address_line2 ?? "").trim();
  const detail = d && a1 && d === a1 ? d : [d, a1].filter(Boolean).join(" ");
  const parts = [r.region, r.city, detail, a2].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

