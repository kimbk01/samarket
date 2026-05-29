/**
 * 매장 로고 편집 오버레이 — 첨부 실루엣(바디+뷰파인더+셔터+렌즈 화이트) 형태.
 */
export function OwnerStoreLogoCameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="5" y="3" width="7" height="5" rx="1.2" fill="currentColor" />
      <path d="M17 1h14l4 7H13L17 1Z" fill="currentColor" />
      <rect x="3" y="8" width="42" height="30" rx="4" fill="currentColor" />
      <circle cx="24" cy="23" r="9" fill="var(--biz-cream, #fffcfc)" />
    </svg>
  );
}
