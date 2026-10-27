"use client";

/**
 * P-6 (2026-10-27, Owner 승인 v3): 거래 주제 배지 1종 — **이름 + 주제 색, 아이콘 없음**.
 * 색은 카테고리 설정 `categories.badge_color`(어드민 「거래 메뉴」에서 지정), 없으면 기본 중립색.
 * 목록 카드·어드민 미리보기가 같은 컴포넌트를 쓴다.
 */
export function TradeTopicBadge({
  label,
  color,
  className = "",
}: {
  label: string;
  color?: string | null;
  className?: string;
}) {
  const text = label.trim();
  if (!text) return null;
  const hex = typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : null;
  return (
    <span
      data-trade-topic-badge="1"
      className={`inline-flex max-w-full items-center truncate rounded-ui-rect px-1.5 py-0.5 text-[12px] font-semibold leading-none text-white ${
        hex ? "" : "bg-sam-surface-dark"
      } ${className}`}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      {text}
    </span>
  );
}
