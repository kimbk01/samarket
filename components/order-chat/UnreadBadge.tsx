"use client";

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 sam-text-xxs font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
