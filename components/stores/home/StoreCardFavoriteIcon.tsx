"use client";

import { useCallback, useState } from "react";
import {
  STORE_FAVORITE_CHANGED_EVENT,
  type StoreFavoriteChangedDetail,
} from "@/lib/stores/store-favorite-events";

/**
 * 목록 카드용 찜 — 초기 상태는 요청 없이 아웃라인만; 탭 시 토글(401 시 안내).
 */
export function StoreCardFavoriteIcon({
  slug,
  className = "",
}: {
  slug: string;
  className?: string;
}) {
  const decoded = decodeURIComponent((slug || "").trim());
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy || !decoded) return;
      setBusy(true);
      try {
        const method = on ? "DELETE" : "POST";
        const res = await fetch(`/api/stores/${encodeURIComponent(decoded)}/favorite`, {
          method,
          credentials: "include",
        });
        const json = await res.json();
        if (res.status === 401) {
          window.alert("로그인 후 찜할 수 있습니다.");
          return;
        }
        if (!json?.ok) return;
        const favorited = !!json.favorited;
        const favorite_count = Number(json.favorite_count) || 0;
        setOn(favorited);
        window.dispatchEvent(
          new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
            detail: { slug: decoded, favorited, favorite_count },
          })
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, on, decoded]
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/45 disabled:opacity-60 ${className}`}
      aria-label={on ? "찜 해제" : "찜하기"}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21.364l-7.682-7.682a4.5 4.5 0 010-6.364z"
        />
      </svg>
    </button>
  );
}
