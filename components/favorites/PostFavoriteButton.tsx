"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFavoriteStatus } from "@/lib/favorites/getFavoriteStatus";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

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
 * - 목록: `favorited` prop 이 기준. P-3 (F5): 누르는 즉시 **하트만** 바뀌어 보이고(버튼 내부 대기값),
 *   부모 맵은 API 성공 후에만 `onFavoriteChange` 로 갱신(찜 목록 카드 제거·맵 꼬임 방지). 실패하면 대기값을 지워 되돌린다.
 * - 서버에는 원하는 상태를 명시해 보낸다(멱등 — 두 번 누름·다른 기기에도 뒤집히지 않음).
 * - 채팅 등: 단건 getFavoriteStatus + 로컬 state, 토글 시 낙관적 UI 후 실패 시 롤백.
 */
export function PostFavoriteButton({
  postId,
  authorUserId,
  iconClassName = "h-6 w-6",
  favorited: favoritedProp = false,
  onFavoriteChange,
}: PostFavoriteButtonProps) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
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

  const [listPending, setListPending] = useState<boolean | null>(null);
  const displayFavorited = listMode ? (listPending ?? !!favoritedProp) : standaloneFavorited;

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
        await requireAction("trade_favorite", () => undefined);
        return;
      }
      if (authorUserId && user.id === authorUserId) return;
      if (busyRef.current) return;
      if (!listMode && !standaloneLoaded) return;

      busyRef.current = true;
      const prev = displayRef.current;
      const next = !prev;

      if (listMode) setListPending(next);
      else setStandaloneFavorited(next);

      try {
        const res = await toggleFavorite(postId, next);
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
        if (listMode) setListPending(null);
        busyRef.current = false;
      }
    },
    [postId, authorUserId, requireAction, onFavoriteChange, listMode, standaloneLoaded]
  );

  if (hideForOwnPost) return null;

  if (!listMode && !standaloneLoaded) {
    return (
      <span className={`inline-flex ${iconClassName} shrink-0 text-sam-meta`} aria-hidden>
        <HeartOutlineIcon className={iconClassName} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex shrink-0 flex-col items-center justify-center text-sam-muted"
      aria-label={displayFavorited ? t("store_favorite_remove_aria") : t("store_favorite_add_aria")}
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
