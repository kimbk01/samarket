"use client";

import { useEffect, useState } from "react";
import { useAppBootProfile } from "@/components/app/AppBootProvider";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";

/**
 * 하단 「내정보」 탭 — 아이콘 대신 내 프로필 사진(네이버 「마이」 방식, 홈 설계안 v11).
 * 사진 = `profiles.avatar_url` (앱 부팅 프로필 — 사진 변경 시 `ProfileImageField` 가 갱신).
 * 비로그인·사진 없음 = 기본 그림(`withDefaultAvatar`).
 *
 * 앱 진입 v3 ① (실측 2026-11-17 삼성: 사람 아이콘 → 회색 원 → 사진, 2번 바뀜): 새 사진은 다 받은 뒤에 바꾼다
 * — 받는 동안 빈 회색 원을 보이지 않는다.
 */
export function BottomNavProfileAvatar() {
  const profile = useAppBootProfile();
  const src = withDefaultAvatar(profile?.avatar_url ?? null);
  const [shown, setShown] = useState(src);

  useEffect(() => {
    if (src === shown) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setShown(src);
    };
    img.onerror = () => {
      if (!cancelled) setShown(withDefaultAvatar(null));
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, shown]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 회원 업로드 사진(외부 저장소 URL) · 28px 고정
    <img
      src={shown}
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
