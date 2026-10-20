import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { formatUserAddressPublic } from "@/lib/addresses/user-address-display-ssot";
import { isLoginDeniedMemberAccount } from "@/lib/auth/member-account-state";

/**
 * 공개 프로필(`/api/users/[userId]/public-profile`, `/api/users/by-username/…`, `/u/[username]`) 노출 규칙 SSOT.
 * - 공개 아이디(@) 표시를 위해 `dibay_id` 를 함께 읽는다.
 * - 탈퇴·차단 계정은 공개 프로필을 보여주지 않는다(`isLoginDeniedMemberAccount`).
 * - 동네는 PUBLIC 허용 목록(바랑가이·시) 만 — 건물명·도로명·상세 주소 금지.
 */
export const PUBLIC_PROFILE_SELECT =
  "id, display_name, nickname, username, dibay_id, avatar_url, trust_score, manner_score, manner_temperature, status, deleted_at";

/** 신뢰 컬럼 미존재(구 스키마) 폴백 */
export const PUBLIC_PROFILE_SELECT_FALLBACK =
  "id, display_name, nickname, username, dibay_id, avatar_url, status, deleted_at";

export function isPublicProfileHidden(row: { status?: string | null; deleted_at?: string | null }): boolean {
  return isLoginDeniedMemberAccount(row);
}

export function resolvePublicTradeLocationLine(master: UserAddressDTO | null | undefined): string | null {
  return formatUserAddressPublic(master);
}
