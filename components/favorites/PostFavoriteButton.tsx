"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getFavoriteStatus } from "@/lib/favorites/getFavoriteStatus";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import { getCurrentUser } from "@/lib/auth/get-current-user";

const LOGIN_REDIRECT = "/mypage/account";

export interface PostFavoriteButtonProps {
  postId: string;
  authorUserId?: string | null;
  iconClassName?: string;
  /**
   * 목록 모드: 부모 `favoriteMap` 값만 하트에 반영 (내부 state와 이중 관리 안 함)
   */
  favorited?: boolean;
  /** 목록 모드: `favorited`와 함께 사용. 클릭 시 부모 state 갱신 */
  onFavoriteChange?: (isFavorite: boolean) => void;
}

/**
 * - 목록: `favorited` prop만 하트에 반영. API 성공 후에만 `onFavoriteChange` 호출(낙관적 업데이트 없음 — 언마운트/맵 꼬임 방지).
 * - 채팅 등: 단건 getFavoriteStatus + 로컬 state, 토글 시 낙관적 UI 후 실패 시 롤백.
 */
export function PostFavoriteButton({
  postId,
  authorUserId,
  iconClassName = "h-6 w-6",
  favorited: favoritedProp = false,
  onFavoriteChange,
}: PostFavoriteButtonProps) {
  const router = useRouter();
  const listMode = onFavoriteChange != null;

  const [standaloneFavorited, setStandaloneFavorited] = useState(false);
  const [standaloneLoaded, setStandaloneLoaded] = useState(false);

  useEffect(() => {
    if (listMode) return;
    let cancelled = false;
    getFavoriteStatus(postId).then((v) => {
      if (!cancelled) {
        setStandaloneFavorited(v);
        setStandaloneLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [postId, listMode]);

  const displayFavorited = listMode ? !!favoritedProp : standaloneFavorited;

  /** 클릭 시점의 최신 표시값 (렌더마다 동기화 — 클로저 stale 방지) */
  const displayRef = useRef(displayFavorited);
  displayRef.current = displayFavorited;

  const busyRef = useRef(false);

  const me = getCurrentUser();
  const hideForOwnPost =
    Boolean(authorUserId?.trim()) && me?.id != null && me.id === authorUserId;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const user = getCurrentUser();
      if (!user?.id) {
        router.push(LOGIN_REDIRECT);
        return;
      }
      if (authorUserId && user.id === authorUserId) return;
      if (busyRef.current) return;
      if (!listMode && !standaloneLoaded) return;

      busyRef.current = true;
      const prev = displayRef.current;
      const next = !prev;

      /* 목록: 낙관적 업데이트 안 함 — 찜 목록에서 해제 시 카드가 바로 사라져 언마운트·요청 꼬임 방지. 홈도 서버 응답 후에만 맵 반영 */
      if (!listMode) {
        setStandaloneFavorited(next);
      }

      try {
        const res = await toggleFavorite(postId);
        if (!res.ok) {
          if (!listMode) {
            setStandaloneFavorited(prev);
          }
        } else if (listMode) {
          onFavoriteChange!(res.isFavorite);
        } else {
          setStandaloneFavorited(res.isFavorite);
        }
      } finally {
        busyRef.current = false;
      }
    },
    [postId, authorUserId, router, onFavoriteChange, listMode, standaloneLoaded]
  );

  if (hideForOwnPost) return null;

  if (!listMode && !standaloneLoaded) {
    return (
      <span className={`inline-flex ${iconClassName} shrink-0 text-gray-300`} aria-hidden>
        <HeartOutlineIcon className={iconClassName} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex shrink-0 flex-col items-center justify-center text-gray-500"
      aria-label={displayFavorited ? "관심 해제" : "관심"}
    >
      {displayFavorited ? (
        <HeartFilledIcon className={`${iconClassName} text-red-500`} />
      ) : (
        <HeartOutlineIcon className={iconClassName} />
      )}
    </button>
  );
}

function HeartOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function HeartFilledIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}
