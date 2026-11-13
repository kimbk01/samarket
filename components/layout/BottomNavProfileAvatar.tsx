"use client";

import { useAppBootProfile } from "@/components/app/AppBootProvider";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";

/**
 * 하단 「내정보」 탭 — 아이콘 대신 내 프로필 사진(네이버 「마이」 방식, 홈 설계안 v11).
 * 사진 = `profiles.avatar_url` (앱 부팅 프로필 — 사진 변경 시 `ProfileImageField` 가 갱신).
 * 비로그인·사진 없음 = 기본 그림(`withDefaultAvatar`).
 */
export function BottomNavProfileAvatar() {
  const profile = useAppBootProfile();
  const src = withDefaultAvatar(profile?.avatar_url ?? null);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 회원 업로드 사진(외부 저장소 URL) · 28px 고정
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      decoding="async"
      draggable={false}
      className="app-bottom-nav-profile-avatar"
      data-bottom-nav-profile-avatar
    />
  );
}
