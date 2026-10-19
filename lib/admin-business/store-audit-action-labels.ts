/**
 * 매장 작업 기록 이름 — audit action `store.<action>` → 운영자 문구 (DEF-19).
 * 클라이언트 안전 (매장 허브 이력 탭·요약 카드 공용).
 */

/** DEF-19 — 작업 기록 이름 (audit action `store.<action>` → 운영자 문구). */
const AUDIT_ACTION_LABELS: Record<string, [string, string]> = {
  start_review: ["심사 시작", "Review started"],
  mark_under_review: ["심사 시작", "Review started"],
  approve_store: ["입점 승인", "Store approved"],
  reject_store: ["입점 거절", "Store rejected"],
  request_revision: ["보완 요청", "Changes requested"],
  suspend_store: ["운영 중지", "Store suspended"],
  resume_store: ["운영 재개", "Store resumed"],
  approve_sales: ["판매 승인", "Sales approved"],
  reject_sales: ["판매 거절", "Sales rejected"],
  suspend_sales: ["판매 중지", "Sales suspended"],
  set_store_visible: ["노출 변경", "Visibility changed"],
  set_owner_identity_editable: ["매장명 수정 권한 변경", "Name edit permission changed"],
  set_admin_memo: ["관리자 메모 저장", "Admin memo saved"],
  set_store_name: ["매장명 변경", "Store name changed"],
  set_store_taxonomy: ["업종 변경", "Category changed"],
  set_store_contact: ["연락처 변경", "Contact changed"],
  set_store_location: ["위치 변경", "Location changed"],
  set_business_hours: ["영업시간 변경", "Business hours changed"],
  set_delivery_flags: ["영업·배달 설정 변경", "Open/delivery settings changed"],
  set_delivery_radius: ["배달 반경 변경", "Delivery radius changed"],
  set_store_delivery_distance: ["배달 반경·거리 정책 변경", "Delivery radius/distance policy changed"],
  owner_resubmit: ["사장님 보완 재제출", "Owner resubmitted"],
  admin_operational_notice: ["사장님에게 알림 보내기", "Notice sent to owner"],
  suspend_sales_member_sanction: ["회원 제재로 판매 중지", "Sales suspended (member sanction)"],
  "delivery_service_areas.replace": ["서비스 지역 변경", "Service area changed"],
};

export function mapAuditAction(action: string, ko: boolean): string {
  const key = action.trim().replace(/^store\./, "");
  const hit = AUDIT_ACTION_LABELS[key];
  if (hit) return ko ? hit[0] : hit[1];
  return ko ? "매장 정보 변경" : "Store updated";
}
