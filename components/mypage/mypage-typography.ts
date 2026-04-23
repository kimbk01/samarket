/**
 * 내정보 콘솔 공통 타이포 — 섹션·본문·보조 텍스트 크기를 한 토큰으로 맞춤
 */
export const MYPAGE_TYPO = {
  /** 페이지/패널 제목 */
  title: "text-[12px] font-semibold leading-snug text-sam-fg sm:text-base",
  /** 섹션 부제·설명 */
  description: "text-[13px] leading-snug text-sam-muted sm:text-sm",
  /** 사이드바 그룹 라벨 */
  navGroup: "text-[13px] font-semibold leading-snug",
  /** 사이드바 하위 항목 */
  navItem: "text-[13px] leading-snug",
  /** 카드·폼 본문 */
  body: "text-[13px] leading-snug text-sam-fg sm:text-sm",
  /** 메타·캡션 */
  meta: "text-[12px] leading-snug text-sam-muted",
} as const;
