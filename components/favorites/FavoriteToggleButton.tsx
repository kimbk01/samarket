"use client";

import { useFavorite } from "@/contexts/FavoriteContext";

interface FavoriteToggleButtonProps {
  productId: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}

export function FavoriteToggleButton({
  productId,
  className = "",
  iconClassName = "h-6 w-6",
  showLabel = false,
}: FavoriteToggleButtonProps) {
  const { isFavorite, toggle } = useFavorite();
  const liked = isFavorite(productId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
      className={`flex shrink-0 flex-col items-center gap-0.5 sam-text-xxs text-sam-muted ${className}`}
      aria-label={liked ? "관심 해제" : "관심"}
    >
      {liked ? (
        <HeartFilledIcon className={`${iconClassName} text-red-500`} />
      ) : (
        <HeartOutlineIcon className={iconClassName} />
      )}
      {showLabel && <span>관심</span>}
    </button>
  );
}

function HeartOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
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
