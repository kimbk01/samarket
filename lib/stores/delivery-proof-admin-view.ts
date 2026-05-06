import type { SupabaseClient } from "@supabase/supabase-js";

export const DELIVERY_PROOFS_BUCKET = "delivery-proofs";

/** 관리자 증빙 미리보기용 서명 URL TTL (초) */
export const DELIVERY_PROOF_SIGNED_URL_TTL_SEC = 600;

/**
 * 라이더·구매자·매장 응답에서 객체 경로·레거시 공개 URL 제거 (증빙 메타만 클라에 유지 가능).
 */
export function stripDeliveryProofStorageFromClientRow(row: Record<string, unknown>): Record<string, unknown> {
  const {
    delivered_proof_image_url: _du,
    delivered_proof_image_path: _dp,
    failure_proof_image_url: _fu,
    failure_proof_image_path: _fp,
    ...rest
  } = row;
  return rest;
}

/**
 * 관리자 전용: path 우선 서명 URL, 없으면 레거시 https URL (badge 용 플래그).
 * 응답에서 원본 path·레거시 URL 컬럼은 제거하고 view 필드만 내려보냄.
 */
export async function augmentAdminDeliveryRowWithProofViews(
  sb: SupabaseClient,
  delivery: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  if (!delivery) return null;

  const pathDel = typeof delivery.delivered_proof_image_path === "string" ? delivery.delivered_proof_image_path.trim() : "";
  const legacyDel =
    typeof delivery.delivered_proof_image_url === "string" ? delivery.delivered_proof_image_url.trim() : "";

  let delivered_proof_admin_view_url: string | null = null;
  let delivered_proof_admin_view_legacy_public = false;

  if (pathDel) {
    const { data, error } = await sb.storage
      .from(DELIVERY_PROOFS_BUCKET)
      .createSignedUrl(pathDel, DELIVERY_PROOF_SIGNED_URL_TTL_SEC);
    if (!error && data?.signedUrl) delivered_proof_admin_view_url = data.signedUrl;
  } else if (legacyDel && /^https:\/\//i.test(legacyDel)) {
    delivered_proof_admin_view_url = legacyDel;
    delivered_proof_admin_view_legacy_public = true;
  }

  const pathFail =
    typeof delivery.failure_proof_image_path === "string" ? delivery.failure_proof_image_path.trim() : "";
  const legacyFail =
    typeof delivery.failure_proof_image_url === "string" ? delivery.failure_proof_image_url.trim() : "";

  let failure_proof_admin_view_url: string | null = null;
  let failure_proof_admin_view_legacy_public = false;

  if (pathFail) {
    const { data, error } = await sb.storage
      .from(DELIVERY_PROOFS_BUCKET)
      .createSignedUrl(pathFail, DELIVERY_PROOF_SIGNED_URL_TTL_SEC);
    if (!error && data?.signedUrl) failure_proof_admin_view_url = data.signedUrl;
  } else if (legacyFail && /^https:\/\//i.test(legacyFail)) {
    failure_proof_admin_view_url = legacyFail;
    failure_proof_admin_view_legacy_public = true;
  }

  const {
    delivered_proof_image_path,
    failure_proof_image_path,
    delivered_proof_image_url,
    failure_proof_image_url,
    ...rest
  } = delivery;

  return {
    ...rest,
    delivered_proof_admin_view_url,
    delivered_proof_admin_view_legacy_public,
    failure_proof_admin_view_url,
    failure_proof_admin_view_legacy_public,
  };
}
