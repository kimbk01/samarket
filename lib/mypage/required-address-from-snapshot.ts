/**
 * 주소 기본값 스냅샷(`GET /api/me/address-defaults`) → 필수정보 대표 주소 판정 입력.
 * 홈(`useMypageHomeModel`)과 계정 S03 이 같은 함수를 쓴다 — 추가 요청 없음(이미 받은 응답만 해석).
 */
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { formatUserAddressPublic } from "@/lib/addresses/user-address-display-ssot";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { RequiredInfoStatus } from "@/lib/mypage/mypage-home-snapshot";

export type RequiredAddressResolution = {
  status: RequiredInfoStatus;
  /** 대표 주소 공개 라벨(동네) */
  publicLabel: string | null;
  /** 활성 주소 수 — 구버전 응답·실패면 null */
  activeCount: number | null;
};

export function resolveRequiredAddressFromSnapshot(
  snap: AddressDefaultsSnapshot | null | undefined,
): RequiredAddressResolution {
  if (snap?.ok && snap.status === 200) {
    const rawCount = snap.defaults?.activeCount;
    const activeCount = typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : null;
    const master = snap.defaults?.master;
    if (master != null) {
      return {
        status: "complete",
        publicLabel: formatUserAddressPublic(master as UserAddressDTO)?.trim() || null,
        activeCount,
      };
    }
    return { status: "required", publicLabel: null, activeCount };
  }
  return { status: "unknown", publicLabel: null, activeCount: null };
}
