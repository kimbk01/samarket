import type { BusinessProfile, BusinessProfileStatus } from "@/lib/types/business";
import type { BusinessProduct } from "@/lib/types/business";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";

type RelEmbed = { name: string; slug: string } | { name: string; slug: string }[] | null;

function embedName(v: RelEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name ?? null;
  return v.name ?? null;
}

export type StoreRow = {
  id: string;
  owner_user_id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
  store_category_id?: string | null;
  store_topic_id?: string | null;
  store_categories?: RelEmbed;
  store_topics?: RelEmbed;
  description: string | null;
  kakao_id?: string | null;
  phone: string | null;
  email?: string | null;
  website_url?: string | null;
  is_open?: boolean | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  reservation_available?: boolean | null;
  visit_available?: boolean | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat?: number | null;
  lng?: number | null;
  profile_image_url: string | null;
  /** Storage 공개 URL — 동네배달 신규 주문 알림음 (비우면 전역 설정·비프) */
  order_alert_sound_url?: string | null;
  business_hours_json?: unknown;
  gallery_images_json?: unknown;
  approval_status: string;
  /** 관리자 허용 시 기본 정보에서 매장명·업종·세부 주제 수정 가능 */
  owner_can_edit_store_identity?: boolean | null;
  is_visible?: boolean;
  rejected_reason: string | null;
  revision_note?: string | null;
  /** GET /api/me/stores 에서만 채워짐 */
  sales_permission?: { allowed_to_sell: boolean; sales_status: string } | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

function mapApprovalToStatus(s: string): BusinessProfileStatus {
  if (s === "approved") return "active";
  if (s === "rejected") return "rejected";
  if (s === "suspended") return "paused";
  return "pending";
}

export function dbStoreToBusinessProfile(row: StoreRow): BusinessProfile {
  const { intro, kakao } = splitStoreDescriptionAndKakao(row.description, row.kakao_id ?? null);
  const catName = embedName(row.store_categories ?? null);
  const topicName = embedName(row.store_topics ?? null);
  const categoryLine =
    catName && topicName ? `${catName} · ${topicName}` : catName ?? row.business_type ?? "";
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerNickname: "",
    shopName: row.store_name,
    slug: row.slug,
    logoUrl: row.profile_image_url ?? "",
    description: intro ?? "",
    phone: row.phone ?? "",
    kakaoId: kakao ?? "",
    region: row.region ?? "",
    city: row.city ?? "",
    barangay: row.district ?? "",
    addressLabel: row.address_line1 ?? "",
    category: categoryLine || row.business_type || "",
    storeCategoryName: catName,
    storeTopicName: topicName,
    isVisible: row.is_visible,
    approvalStatusRaw: row.approval_status,
    status: mapApprovalToStatus(row.approval_status),
    followerCount: 0,
    productCount: 0,
    reviewCount: 0,
    averageRating: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? "",
    adminMemo:
      row.approval_status === "revision_requested"
        ? row.revision_note ?? "관리자 보완 요청"
        : row.rejected_reason ?? undefined,
  };
}

type ProductCatEmbed = { name: string; slug: string } | { name: string; slug: string }[] | null;

function embedProductCatName(v: ProductCatEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name ?? null;
  return v.name ?? null;
}

export type StoreProductRow = {
  id: string;
  store_id: string;
  title: string;
  price: number | string;
  thumbnail_url: string | null;
  product_status: string;
  created_at: string;
  category_id?: string | null;
  item_type?: string | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
  store_product_categories?: ProductCatEmbed;
};

export function dbStoreProductToBusinessProduct(
  row: StoreProductRow,
  businessProfileId: string
): BusinessProduct {
  const price =
    typeof row.price === "string" ? parseInt(row.price, 10) || 0 : row.price;
  return {
    id: row.id,
    businessProfileId,
    title: row.title,
    price,
    thumbnail: row.thumbnail_url ?? "",
    status: row.product_status,
    createdAt: row.created_at,
    menuGroupName: embedProductCatName(row.store_product_categories ?? null),
    isFeatured: !!row.is_featured,
    itemType: row.item_type ?? null,
    sortOrder: row.sort_order ?? 0,
  };
}
