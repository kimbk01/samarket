"use client";

/**
 * 피드 칩 필터 — 상세 UI는 CommunityFeed 와 동일 정책을 따르는 별도 바가 필요할 때 사용
 */
export function CommunityFilterBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
}
