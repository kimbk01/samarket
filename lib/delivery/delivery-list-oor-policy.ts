/**
 * Member-list OOR policy (post–CUT1 forensic close).
 *
 * - Authenticated + canonical master address (`saved_address`):
 *   OOR badge + normal-list EXCLUDE.
 * - Guest / GPS (`explicit_coords`) / no origin:
 *   distance may sort/display, but MUST NOT become delivery eligibility
 *   (no OOR badge, no exclude).
 */

/**
 * - `saved_address`: 로그인 회원 + 배달 가능한 저장 주소(좌표)
 * - `member_no_address`: 로그인 회원인데 배달 주소(좌표) 없음 — 실제 매장은 배달 가능 여부를 판정할 수 없어 노출하지 않는다
 * - `explicit_coords` / `none`: 비로그인(배달 화면은 로그인 유도 — Owner 2026-10-29)
 */
export type DeliveryListOriginSource = "saved_address" | "member_no_address" | "explicit_coords" | "none";

/** Primary customer-facing OOR state — not "{km}km 초과". */
export const DELIVERY_OOR_PRIMARY_COPY_KO = "배달 가능 지역 아님";
export const DELIVERY_OOR_PRIMARY_COPY_EN = "Outside delivery area";

export function memberDeliveryServiceabilityActive(
  originSource: DeliveryListOriginSource | null | undefined
): boolean {
  return originSource === "saved_address";
}

/**
 * List/home/search OOR flag for customer UI.
 * Guest GPS distance never flips this to true.
 */
export function resolveListDistanceOutOfRange(args: {
  originSource: DeliveryListOriginSource | null | undefined;
  serviceabilityApplies: boolean;
  reason: string | null | undefined;
  /**
   * `stores.store_kind`. 샘플(체험용, 주문 불가) 매장은 배달 가능 지역 판정 대상이 아니다 —
   * 주소와 무관하게 목록·홈·검색·배너에 남는다 (Owner 2026-10-29 확정). 실매장 판정은 불변.
   */
  storeKind?: string | null;
}): boolean {
  if (args.storeKind === "sample") return false;
  if (!memberDeliveryServiceabilityActive(args.originSource)) return false;
  if (!args.serviceabilityApplies) return false;
  return args.reason === "out_of_range" ||
    args.reason === "missing_store_coords" ||
    args.reason === "unselected_lgu" ||
    args.reason === "missing_lgu_identity" ||
    args.reason === "empty_selected_areas";
}

/**
 * 회원 배달 목록 노출 단일 판정 (홈·업종·검색·배너 공통, Owner 2026-10-29).
 * - 샘플: 항상 노출 (주소 무관)
 * - 저장 주소 회원: 배달 가능 지역 밖이면 제외
 * - 주소 없는 회원: 실제 매장 제외 (배달 진입 시 주소 설정 배너)
 * - 비로그인: 판정 없음 (배달 화면 자체가 로그인 유도)
 */
export function shouldExcludeStoreFromMemberDeliveryList(args: {
  originSource: DeliveryListOriginSource | null | undefined;
  distanceOutOfRange: boolean;
  storeKind: string | null | undefined;
}): boolean {
  if (args.storeKind === "sample") return false;
  if (args.originSource === "member_no_address") return true;
  return memberDeliveryServiceabilityActive(args.originSource) && args.distanceOutOfRange === true;
}
