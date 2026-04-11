"use client";

import { useCallback, useRef, useState } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const DELETE_WIDTH = 72;
const SWIPE_CLOSE_THRESHOLD = 36;

type Props = {
  friend: CommunityMessengerProfileLite;
  busyFavorite: boolean;
  busyDelete: boolean;
  onRowPress: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
};

/**
 * LINE 스타일 친구 행 — 좌측 별(즐겨찾기), 우측 영역 스와이프 시 삭제.
 */
export function MessengerLineFriendRow({
  friend,
  busyFavorite,
  busyDelete,
  onRowPress,
  onToggleFavorite,
  onDelete,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const activeDrag = useRef(false);

  const close = useCallback(() => setOffset(0), []);

  const onPointerDown = (e: React.PointerEvent) => {
    activeDrag.current = true;
    setDragging(true);
    startX.current = e.clientX;
    startOffset.current = offset;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!activeDrag.current) return;
    const dx = e.clientX - startX.current;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -DELETE_WIDTH) next = -DELETE_WIDTH;
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activeDrag.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setOffset((cur) => (cur < -SWIPE_CLOSE_THRESHOLD ? -DELETE_WIDTH : 0));
  };

  const avatarSrc = friend.avatarUrl ?? undefined;
  const initial = friend.label.trim().slice(0, 1) || "?";

  return (
    <div className="flex min-h-[56px] items-stretch gap-1 rounded-ui-rect border border-gray-100 bg-white py-1 pl-1 pr-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        disabled={busyFavorite}
        className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full text-amber-500 hover:bg-amber-50 disabled:opacity-50"
        aria-label={friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
        aria-pressed={friend.isFavoriteFriend}
      >
        <span className="text-[22px] leading-none">{friend.isFavoriteFriend ? "★" : "☆"}</span>
      </button>

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-ui-rect">
        <div
          className="absolute inset-y-0 right-0 flex w-[72px] items-stretch bg-red-600"
          style={{ pointerEvents: offset < -8 ? "auto" : "none" }}
        >
          <button
            type="button"
            disabled={busyDelete}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              close();
            }}
            className="flex w-full items-center justify-center text-[13px] font-semibold text-white disabled:opacity-50"
          >
            삭제
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              if (offset < -20) close();
              else onRowPress();
            }
          }}
          className="relative flex cursor-pointer items-center gap-3 bg-white px-2 py-2 touch-pan-y"
          style={{
            transform: `translateX(${offset}px)`,
            transition: dragging ? "none" : "transform 0.2s ease-out",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (offset < -20) {
              close();
              return;
            }
            onRowPress();
          }}
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gray-100">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-gray-500">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-gray-900">{friend.label}</p>
            <p className="truncate text-[12px] text-gray-500">{friend.subtitle ?? "SAMarket"}</p>
          </div>
          <span className="shrink-0 text-gray-300" aria-hidden>
            ›
          </span>
        </div>
      </div>
    </div>
  );
}
