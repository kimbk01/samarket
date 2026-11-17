"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useAppBootProfile } from "@/components/app/AppBootProvider";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { useLastRunSnapshot } from "@/hooks/use-last-run-snapshot";
import { updateLastRunSnapshot } from "@/lib/startup/last-run-snapshot";

/**
 * 하단 「내정보」 탭 — 아이콘 대신 내 프로필 사진(네이버 「마이」 방식, 홈 설계안 v11).
 * 사진 = `profiles.avatar_url` (앱 부팅 프로필 — 사진 변경 시 `ProfileImageField` 가 갱신).
 * 비로그인·사진 없음 = 기본 그림(`withDefaultAvatar`).
 *
 * 앱 진입 v3 ① (실측 2026-11-17 삼성: 사람 아이콘 → 회색 원 → 사진, 2번 바뀜): 새 사진은 다 받은 뒤에 바꾼다
 * — 받는 동안 빈 회색 원을 보이지 않는다.
 *
 * 앱 진입 실기 F3-a·b (MY 사진 약 +2초): 프로필이 오기 전에는 같은 계정의 지난 실행 사진 주소를 쓴다.
 * 첫 클라이언트 커밋(layout effect)에서 받기를 시작하고, 기기 캐시에 있어 바로 쓸 수 있으면 첫 그림부터 사진을 보인다.
 */
export function BottomNavProfileAvatar() {
  const profile = useAppBootProfile();
  const lastRun = useLastRunSnapshot();
  const seededUrl = profile == null ? (lastRun?.avatarUrl ?? null) : null;
  const src = withDefaultAvatar(profile?.avatar_url ?? seededUrl);
  const [shown, setShown] = useState(src);

  useLayoutEffect(() => {
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
    /** 메모리 캐시에 있으면 받기 기다림 없이 이번 그림에 바로 */
    if (img.complete && img.naturalWidth > 0) {
      cancelled = true;
      setShown(src);
    }
    return () => {
      cancelled = true;
    };
  }, [src, shown]);

  /** F3-a 기록 — 프로필 조회 성공 뒤 사진 주소(없으면 null) */
  const profileId = profile?.id ?? null;
  const profileAvatar = profile ? (profile.avatar_url ?? null) : undefined;
  useEffect(() => {
    if (!profileId || profileAvatar === undefined) return;
    updateLastRunSnapshot({ avatarUrl: profileAvatar }, profileId);
  }, [profileId, profileAvatar]);

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
