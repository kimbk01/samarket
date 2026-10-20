/**
 * ACC-06 — 오너 매장 정보 변경 감사 이력 (before/after 는 실제로 바뀐 키만).
 * 순수 함수 — 감사 기록 쓰기(`appendAuditLog`, 서버 전용)는 라우트에서 한다.
 */

/** PATCH 전에 읽는 현재값 — 오너 PATCH 가 쓸 수 있는 모든 컬럼 (감사 before 용). */
export const OWNER_STORE_PATCH_CURRENT_SELECT = [
  "store_name, business_type, store_category_id, store_topic_id",
  "description, phone, kakao_id, email, website_url, profile_image_url",
  "region, city, district, address_line1, address_line2, place_id, formatted_address, detail_address, lat, lng",
  "is_visible, first_listed_at, is_open, delivery_available, delivery_radius_km, menu_sold_out_bottom",
  "messenger_voice_messages_enabled, messenger_voice_calls_enabled, messenger_video_calls_enabled",
  "pickup_available, reservation_available, visit_available",
  "business_hours_json, gallery_images_json",
].join(", ");

function stableJson(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

function sameAuditValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const na = a === null || a === undefined || a === "" ? null : Number(a);
    const nb = b === null || b === undefined || b === "" ? null : Number(b);
    if (na === null || nb === null) return na === nb;
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
  }
  return stableJson(a ?? null) === stableJson(b ?? null);
}

/** patch 키 중 현재값과 다른 키만 before/after 로 — 바뀐 것이 없으면 null(감사 생략). */
export function buildOwnerStoreUpdateAuditDiff(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown>; fields: string[] } | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const prev = Object.prototype.hasOwnProperty.call(current, k) ? current[k] : null;
    if (sameAuditValue(prev, v)) continue;
    before[k] = prev ?? null;
    after[k] = v ?? null;
    fields.push(k);
  }
  if (fields.length === 0) return null;
  return { before, after, fields };
}
