"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppBootProfile } from "@/components/app/AppBootProvider";
import { SAMARKET_DEFAULT_AVATAR_URL, withDefaultAvatar } from "@/lib/profile/default-avatar";
import { useLastRunSnapshot } from "@/hooks/use-last-run-snapshot";
import { AVATAR_THUMB_DATA_MAX, updateLastRunSnapshot } from "@/lib/startup/last-run-snapshot";

/** 작은 사본 크기(px) — 하단 탭 사진 26px × 화면 배율 3 남짓 */
const THUMB_PX = 84;

/** 작은 사본 만들기 — 교차 출처 읽기가 안 되는 호스트는 실패(null) */
async function makeAvatarThumb(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = src;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_PX;
    canvas.height = THUMB_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // 가운데 정사각형(object-fit: cover 와 같은 자르기)
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, THUMB_PX, THUMB_PX);
    const data = canvas.toDataURL("image/jpeg", 0.72);
    return data.startsWith("data:image/") && data.length <= AVATAR_THUMB_DATA_MAX ? data : null;
  } catch {
    return null;
  }
}

/**
 * 하단 「내정보」 탭 — 아이콘 대신 내 프로필 사진(네이버 「마이」 방식, 홈 설계안 v11).
 * 사진 = `profiles.avatar_url` (앱 부팅 프로필 — 사진 변경 시 `ProfileImageField` 가 갱신).
 * 비로그인·사진 없음 = 기본 그림(`withDefaultAvatar`).
 *
 * 설계 D3 (Owner 「승인·사진 받기 제외」 2026-11-18 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §16-1):
 * - 실측(빌드 73): 덮개가 걷힌 뒤 「기본 그림 → 회색 원 → 사진」 2번 바뀜. 회색 = `decoding="async"` 요소가 새 주소를 해독하는
 *   1~2프레임. 사진 = 첫 클라이언트 커밋에서야 받기 시작.
 * - 같은 계정의 지난 실행에 남긴 작은 사본(data URL)을 첫 클라이언트 커밋에서 바로 쓴다 — 네트워크 없이 보이는 첫 그림에 든다.
 * - 그림을 바꿀 때는 받기 + 해독(`decode()`)이 끝난 뒤 바꾸고, 요소는 동기 해독 — 회색 프레임 없음.
 * - 서버·hydration 첫 렌더는 늘 기본 그림(그림 동일) — 바꿈은 layout effect 에서만.
 */
export function BottomNavProfileAvatar() {
  const profile = useAppBootProfile();
  const lastRun = useLastRunSnapshot();
  const profileId = profile?.id ?? null;
  /** undefined = 프로필 아직 모름 · null = 사진 없음 */
  const realUrl = profile ? profile.avatar_url?.trim() || null : undefined;
  const seededUrl = profile == null ? (lastRun?.avatarUrl ?? null) : null;
  const target = withDefaultAvatar(realUrl === undefined ? seededUrl : realUrl);
  const thumb = lastRun?.avatarThumb ?? null;
  /** 작은 사본을 쓸 수 있는가 — 프로필을 아직 모르거나, 실제 주소가 사본의 원본과 같을 때 */
  const fast = thumb && (realUrl === undefined || thumb.src === realUrl) ? thumb.data : null;

  const [shown, setShown] = useState<string>(SAMARKET_DEFAULT_AVATAR_URL);
  const failedRef = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (target === shown) return;
    // ① 작은 사본 — 같은 프레임에 바로(data URL · 동기 해독)
    if (fast && shown === SAMARKET_DEFAULT_AVATAR_URL) {
      setShown(fast);
      return;
    }
    if (failedRef.current.has(target)) return;
    // ② 실제 그림 — 받기·해독이 끝난 뒤 교체(회색 프레임 없음)
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = target;
    const finish = (ok: boolean) => {
      if (cancelled) return;
      if (ok) {
        setShown(target);
        return;
      }
      failedRef.current.add(target);
      if (shown !== fast && shown !== SAMARKET_DEFAULT_AVATAR_URL) setShown(fast ?? SAMARKET_DEFAULT_AVATAR_URL);
    };
    if (typeof img.decode === "function") {
      img.decode().then(
        () => finish(true),
        () => finish(false)
      );
    } else {
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
    }
    return () => {
      cancelled = true;
    };
  }, [target, shown, fast]);

  /** F3-a 기록 — 프로필 조회 성공 뒤 사진 주소(없으면 null) */
  const profileAvatar = profile ? (profile.avatar_url ?? null) : undefined;
  useEffect(() => {
    if (!profileId || profileAvatar === undefined) return;
    updateLastRunSnapshot({ avatarUrl: profileAvatar }, profileId);
  }, [profileId, profileAvatar]);

  /** D3 기록 — 실제 사진이 화면에 나온 뒤 작은 사본(원본이 바뀌었을 때만) · 사진을 지웠으면 사본도 지움 */
  const thumbSrc = thumb?.src ?? null;
  useEffect(() => {
    if (!profileId || realUrl === undefined) return;
    if (realUrl === null) {
      if (thumbSrc) updateLastRunSnapshot({ avatarThumb: null }, profileId);
      return;
    }
    if (shown !== realUrl || thumbSrc === realUrl) return;
    let cancelled = false;
    void makeAvatarThumb(realUrl).then((data) => {
      if (cancelled || !data) return;
      updateLastRunSnapshot({ avatarThumb: { src: realUrl, data } }, profileId);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, realUrl, shown, thumbSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 회원 업로드 사진(외부 저장소 URL) · 28px 고정
    <img
      src={shown}
      alt=""
      width={28}
      height={28}
      decoding="sync"
      draggable={false}
      className="app-bottom-nav-profile-avatar"
      data-bottom-nav-profile-avatar
    />
  );
}
