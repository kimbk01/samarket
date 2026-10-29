import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
import { pickAddressRowForDeliveryRouting } from "@/lib/addresses/pick-address-row-for-delivery-routing";
import type { DeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";

/**
 * 묶음4 R-2 — 배달 홈 첫 페인트용 게이트 **예측** (클라 전용·순수 함수).
 *
 * 원인: 홈 허브는 `meta.viewer_gate` 가 home-feed 응답(수 초)에 실려 와야만 주소 안내를 그렸다.
 * 그 전까지 meta=null → 빈 대기 화면(히어로 자리 + 피드 블랭크) → 응답 후 주소 배너로 교체.
 *
 * 이미 클라에 있는 데이터(로그인 상태 store · `GET /api/me/address-defaults` 스냅샷)로 서버
 * `resolveStoreListDeliveryOrigin` + `resolveDeliveryViewerGate` 와 **같은 규칙**을 적용한다:
 * - 비회원 → `login_required`
 * - 회원 + 대표(master) 주소 없음/배달 좌표 불가 → `address_required`
 * - 회원 + 배달 가능 대표 주소 → `ok`
 * - 판정 재료 없음(확인 중·스냅샷 없음/실패) → null (예측하지 않음)
 *
 * 서버 응답의 `meta.viewer_gate` 가 오면 그것이 항상 우선한다 (예측은 첫 페인트 전용).
 */
export function predictDeliveryViewerGateFromClientState(input: {
  membershipStatus: "checking" | "guest" | "member";
  addressSnapshot: AddressDefaultsSnapshot | null;
}): DeliveryViewerGate | null {
  if (input.membershipStatus === "guest") return "login_required";
  if (input.membershipStatus !== "member") return null;
  const snap = input.addressSnapshot;
  if (!snap || !snap.ok || !snap.defaults) return null;
  const master = coerceUserAddressDTO(snap.defaults.master);
  const row = pickAddressRowForDeliveryRouting({
    master,
    life: null,
    trade: null,
    delivery: null,
  });
  return isDeliveryRoutableMasterAddress(row) ? "ok" : "address_required";
}
