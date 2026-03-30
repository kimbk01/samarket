/** 프로필(닉네임·아바타 등) 저장 후 마이페이지 등이 다시 불러오도록 브로드캐스트 */
export const PROFILE_UPDATED_EVENT = "samarket:profile-updated";

export function dispatchProfileUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
}
