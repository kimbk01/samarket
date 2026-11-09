"use client";

import { invalidateMandatoryAddressGateClientCache } from "@/lib/addresses/mandatory-address-gate-client";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { fetchMeProfileFresh, invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { patchMypageHomeProjection } from "@/lib/mypage/mypage-home-store";

/**
 * 회원 정보 수정(전화 인증 · @아이디 · 주소) 직후 — 서버에서 새로 받아 **클라이언트 사본 전부**를 한 번에 바꾼다.
 *
 * `getMyProfile()` 은 앱 시작 프로필(`peekAppBootProfile`)을 먼저 돌려주므로 수정 직후 재조회에 쓰면
 * 앱을 다시 켤 때까지 예전 값이 남는다(2026-11-09 전화 인증 후 화면 정체 원인). 여기서는 그 값을 건너뛰고
 * `/api/me/profile?fresh=1`(서버 캐시 3종 우회)로 받은 뒤 아래 사본을 같은 값으로 맞춘다:
 *   1. 앱 시작 프로필 — `getMyProfile()`·내정보 홈 등 읽기 화면의 출처
 *   2. 프로필 조회 캐시 — `fetchMeProfileFresh` 가 채움
 *   3. 로그인 사용자 캐시 — `getCurrentUser()` (글쓰기·메신저 전화 게이트)
 *   4. 내정보 홈 화면 상태
 * 서버 조회 실패 시 null — 사본은 건드리지 않는다(예전 값으로 덮어쓰지 않음).
 */
export async function refreshClientMemberAccountAfterMutation(): Promise<ProfileRow | null> {
  invalidateMeProfileDedupedCache();
  invalidateMandatoryAddressGateClientCache();
  invalidateAddressDefaultsSnapshotCache();
  const fresh = await fetchMeProfileFresh("member_account_after_mutation");
  if (!fresh?.id?.trim()) return null;
  mergeAppBootProfileFull(fresh);
  setSupabaseProfileCache(profileRowToClientProfile(fresh));
  patchMypageHomeProjection({ profile: fresh });
  invalidateMypageSummary();
  return fresh;
}
