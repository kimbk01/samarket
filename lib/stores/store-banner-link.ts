import { isUuidLikeString } from "@/lib/shared/uuid-string";

export const STORE_BANNER_LINK_TYPES = new Set(["none", "product", "notice", "coupon"]);

export type CoerceStoreBannerLinkResult =
  | { ok: true; link_type: string; link_target_id: string | null }
  | { ok: false; error: "invalid_link_target_id" };

/** 링크 타입·대상 정규화: none/coupon 은 타겟 제거, product/notice 는 UUID 형식만 허용 */
export function coerceStoreBannerLink(linkType: string, targetRaw: unknown): CoerceStoreBannerLinkResult {
  const lt =
    typeof linkType === "string" && STORE_BANNER_LINK_TYPES.has(linkType.trim()) ? linkType.trim() : "none";
  const raw =
    targetRaw == null || targetRaw === ""
      ? null
      : String(targetRaw).trim() || null;
  if (lt === "none" || lt === "coupon") {
    return { ok: true, link_type: lt, link_target_id: null };
  }
  if (!raw) {
    return { ok: true, link_type: lt, link_target_id: null };
  }
  if (!isUuidLikeString(raw)) {
    return { ok: false, error: "invalid_link_target_id" };
  }
  return { ok: true, link_type: lt, link_target_id: raw };
}
