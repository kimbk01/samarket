"use client";

export function CommunityLikeButton({
  liked,
  count,
  disabled,
  onToggle,
}: {
  liked: boolean;
  count: number;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 text-[13px] ${liked ? "border-rose-300 bg-rose-50 text-rose-800" : "border-sam-border bg-sam-surface text-sam-fg"}`}
    >
      공감 {count}
    </button>
  );
}
