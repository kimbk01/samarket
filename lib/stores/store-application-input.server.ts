/**
 * 매장 입점 신청·보완 재제출 공용 입력 검사 (매장 신청 v2 · Owner 2026-11-10).
 * `POST /api/me/stores`(신청)·`POST /api/me/stores/[storeId]/resubmit`(보완 제출)이 같은 규칙을 쓴다.
 * 화면이 보낸 값은 다시 검사하고, 전화번호는 매장 전화 인증 기록 id 로만 받는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import { computeStoreLocationColumns } from "@/lib/stores/store-location-columns.server";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { RESERVED_STORE_SLUGS } from "@/lib/business/owner-routes";
import {
  STORE_APPLY_LIMITS,
  normalizeStoreApplyName,
  composeStoreNameWithBranch,
} from "@/lib/stores/store-application-limits";

type AnySb = SupabaseClient;

export type StoreApplicationBody = {
  applicantNickname?: unknown;
  shopName?: unknown;
  /** 같은 이름 매장이 있을 때 붙이는 지점명 (체인점) */
  branchName?: unknown;
  description?: unknown;
  requestNote?: unknown;
  kakaoId?: unknown;
  categoryPrimarySlug?: unknown;
  categorySubSlug?: unknown;
  categoryLabelLine?: unknown;
  /** 매장 전화 인증 기록 id (`/api/me/store-phone-verification/verify` 결과) */
  phoneVerificationId?: unknown;
  /** 실제 영업장 위치 — 지도 핀 + 주소 */
  location?: {
    lat?: unknown;
    lng?: unknown;
    placeId?: unknown;
    formattedAddress?: unknown;
    region?: unknown;
    city?: unknown;
    street?: unknown;
    detail?: unknown;
  } | null;
};

export type StoreApplicationFields = {
  applicant_nickname: string;
  store_name: string;
  branch_name: string | null;
  description: string | null;
  application_request_note: string | null;
  kakao_id: string | null;
  store_category_id: string | null;
  store_topic_id: string | null;
  business_type: string;
  location: Record<string, unknown>;
};

export type StoreApplicationInputError =
  | "applicant_nickname_required"
  | "shopName_required"
  | "branch_name_too_long"
  | "description_too_long"
  | "request_note_too_long"
  | "kakao_id_too_long"
  | "category_slugs_required"
  | "category_not_found"
  | "store_location_required"
  | "store_name_duplicate_branch_required"
  | "store_name_duplicate"
  | "name_check_failed";

const s = (v: unknown): string => String(v ?? "").trim();

/** 같은 이름 후보 (RPC `store_name_duplicate_candidates`) */
export async function findStoreNameDuplicates(
  sb: AnySb,
  name: string,
  excludeStoreId: string | null
): Promise<{ ok: true; rows: { id: string; store_name: string; branch_name: string | null; approval_status: string }[] } | { ok: false }> {
  const { data, error } = await sb.rpc("store_name_duplicate_candidates", {
    p_name: name,
    p_exclude_store_id: excludeStoreId,
  });
  if (error) {
    console.error("[store_name_duplicate_candidates]", error.message);
    return { ok: false };
  }
  return { ok: true, rows: (data ?? []) as { id: string; store_name: string; branch_name: string | null; approval_status: string }[] };
}

export async function parseStoreApplicationInput(
  sb: AnySb,
  body: StoreApplicationBody,
  opts: { excludeStoreId: string | null }
): Promise<{ ok: true; fields: StoreApplicationFields } | { ok: false; error: StoreApplicationInputError; status: number }> {
  const nick = normalizeStoreApplyName(s(body.applicantNickname));
  if (nick.length < STORE_APPLY_LIMITS.applicantMin || nick.length > STORE_APPLY_LIMITS.applicantMax) {
    return { ok: false, error: "applicant_nickname_required", status: 400 };
  }
  const shopName = normalizeStoreApplyName(s(body.shopName));
  if (shopName.length < STORE_APPLY_LIMITS.shopNameMin || shopName.length > STORE_APPLY_LIMITS.shopNameMax) {
    return { ok: false, error: "shopName_required", status: 400 };
  }
  const branch = normalizeStoreApplyName(s(body.branchName));
  if (branch.length > STORE_APPLY_LIMITS.branchMax) return { ok: false, error: "branch_name_too_long", status: 400 };
  const description = s(body.description);
  if (description.length > STORE_APPLY_LIMITS.descriptionMax) return { ok: false, error: "description_too_long", status: 400 };
  const requestNote = s(body.requestNote);
  if (requestNote.length > STORE_APPLY_LIMITS.requestNoteMax) return { ok: false, error: "request_note_too_long", status: 400 };
  const kakaoId = s(body.kakaoId);
  if (kakaoId.length > STORE_APPLY_LIMITS.kakaoMax) return { ok: false, error: "kakao_id_too_long", status: 400 };

  /** 매장 이름 중복 — 본 이름이 겹치면 지점명 필수, 지점명을 붙인 최종 이름도 겹치면 거부 */
  const baseDup = await findStoreNameDuplicates(sb, shopName, opts.excludeStoreId);
  if (!baseDup.ok) return { ok: false, error: "name_check_failed", status: 500 };
  if (baseDup.rows.length > 0 && !branch) {
    return { ok: false, error: "store_name_duplicate_branch_required", status: 409 };
  }
  const finalName = composeStoreNameWithBranch(shopName, branch);
  if (branch) {
    const fullDup = await findStoreNameDuplicates(sb, finalName, opts.excludeStoreId);
    if (!fullDup.ok) return { ok: false, error: "name_check_failed", status: 500 };
    if (fullDup.rows.some((r) => normalizeStoreApplyName(r.store_name).toLowerCase() === finalName.toLowerCase())) {
      return { ok: false, error: "store_name_duplicate", status: 409 };
    }
  }

  const primarySlug = s(body.categoryPrimarySlug).toLowerCase();
  const subSlug = s(body.categorySubSlug).toLowerCase();
  if (!primarySlug || !subSlug) return { ok: false, error: "category_slugs_required", status: 400 };
  const { data: catRow, error: catErr } = await sb
    .from("store_categories")
    .select("id, name")
    .eq("slug", primarySlug)
    .eq("is_active", true)
    .maybeSingle();
  if (catErr) return { ok: false, error: "category_not_found", status: 500 };
  if (!catRow?.id) return { ok: false, error: "category_not_found", status: 400 };
  const { data: topicRow, error: topicErr } = await sb
    .from("store_topics")
    .select("id, name")
    .eq("slug", subSlug)
    .eq("store_category_id", catRow.id)
    .eq("is_active", true)
    .maybeSingle();
  if (topicErr) return { ok: false, error: "category_not_found", status: 500 };
  if (!topicRow?.id) return { ok: false, error: "category_not_found", status: 400 };

  /** 실제 영업장 위치 — 지도 좌표 + 주소 글자 필수 (회원 주소록은 매장 위치를 채우지 않는다) */
  const loc = body.location ?? null;
  const lat = parseFiniteLatitude(loc?.lat);
  const lng = parseFiniteLongitude(loc?.lng);
  const formattedAddress = s(loc?.formattedAddress);
  if (lat == null || lng == null || !formattedAddress) {
    return { ok: false, error: "store_location_required", status: 400 };
  }
  const norm = normalizeStoreAddressPh({
    region: s(loc?.region) || null,
    city: s(loc?.city) || null,
    address1: s(loc?.street) || formattedAddress.split(",")[0]?.trim() || null,
    address2: s(loc?.detail) || null,
  });
  const placeId = s(loc?.placeId);
  const location: Record<string, unknown> = {
    region: norm.region,
    city: norm.city,
    district: norm.address1,
    address_line1: norm.address1,
    address_line2: norm.address2,
    lat,
    lng,
    formatted_address: formattedAddress,
    place_id: placeId || null,
    ...computeStoreLocationColumns({
      region: norm.region,
      city: norm.city,
      district: norm.address1,
      address_line1: norm.address1,
      formatted_address: formattedAddress,
    }),
  };

  return {
    ok: true,
    fields: {
      applicant_nickname: nick,
      store_name: finalName,
      branch_name: branch || null,
      description: description || null,
      application_request_note: requestNote || null,
      kakao_id: kakaoId || null,
      store_category_id: String(catRow.id),
      store_topic_id: String(topicRow.id),
      business_type: `${String(catRow.name)} · ${String(topicRow.name)}`,
      location,
    },
  };
}

/**
 * 공개 매장 페이지 주소용 내부 값(slug) — 사장님 화면에 보이지 않는다.
 * 매장 이름이 영문이면 이름 기반(`mandoo-house`), 아니면 짧은 코드(`s-7k2p9q`). `attempt` > 0 이면 뒤에 짧은 코드.
 */
export function makeStoreApplicationSlug(storeName: string, attempt: number): string {
  const ascii = storeName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  const code = () => randomBytes(4).toString("hex").slice(0, 6);
  if (ascii.length >= 3 && !RESERVED_STORE_SLUGS.has(ascii)) {
    return attempt === 0 ? ascii : `${ascii}-${code()}`;
  }
  return `s-${code()}`;
}
