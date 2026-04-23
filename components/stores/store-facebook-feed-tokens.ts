/**
 * Facebook 모바일 피드에 가까운 시각 토큰 — 매장 탭 피드 전용.
 * 브랜드 시그니처와 별도로, 이 화면만 메타 스타일 링크/캔버스를 씁니다.
 */
export const FB = {
  canvas: "bg-[#F7F8FA] dark:bg-[#18191A]",
  card: "rounded-ui-rect border border-sam-border bg-sam-surface shadow-[0_1px_2px_rgba(31,36,48,0.05)] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-sam-surface/[0.08]",
  cardFlat: "rounded-ui-rect border border-sam-border bg-sam-surface dark:bg-[#242526] dark:ring-1 dark:ring-sam-surface/[0.08]",
  name: "text-[15px] font-semibold leading-[1.4] text-sam-fg dark:text-[#E4E6EB]",
  body: "text-[14px] font-normal leading-[1.5] text-sam-fg dark:text-[#E4E6EB]",
  meta: "text-[12px] font-normal leading-[1.4] text-sam-muted dark:text-[#B0B3B8]",
  metaSm: "text-[11px] font-medium leading-[1.3] text-sam-muted dark:text-[#B0B3B8]",
  link: "font-semibold text-sam-primary dark:text-[#8B7CF8]",
  divider: "border-sam-border dark:border-[#3E4042]",
  hairline: "border-sam-border dark:border-[#3E4042]",
  searchWell: "rounded-ui-rect border border-sam-border bg-white dark:bg-[#3A3B3C]",
  primaryBtn:
    "rounded-ui-rect bg-sam-primary px-3 py-2 text-[14px] font-semibold text-white active:bg-sam-primary-hover",
  secondaryBtn:
    "rounded-ui-rect border border-sam-border bg-white px-3 py-2 text-[14px] font-semibold text-sam-fg active:bg-sam-primary-soft dark:bg-[#3A3B3C] dark:text-[#E4E6EB] dark:active:bg-[#4E4F50]",
} as const;
