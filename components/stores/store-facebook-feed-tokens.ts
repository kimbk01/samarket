/**
 * Facebook 모바일 피드에 가까운 시각 토큰 — 매장 탭 피드 전용.
 * 브랜드 시그니처와 별도로, 이 화면만 메타 스타일 링크/캔버스를 씁니다.
 */
export const FB = {
  canvas: "bg-sam-app dark:bg-[#181c23]",
  card: "rounded-sam-md border border-sam-border bg-sam-surface shadow-sam-elevated dark:bg-[#242a34] dark:shadow-none dark:ring-1 dark:ring-sam-surface/[0.08]",
  cardFlat: "rounded-sam-md border border-sam-border bg-sam-surface dark:bg-[#242a34] dark:ring-1 dark:ring-sam-surface/[0.08]",
  name: "text-[16px] font-semibold leading-[1.4] text-sam-fg dark:text-[#E4E6EB]",
  body: "text-[15px] font-normal leading-[1.55] text-sam-fg dark:text-[#E4E6EB]",
  meta: "text-[12px] font-normal leading-[1.4] text-sam-muted dark:text-[#B0B3B8]",
  metaSm: "text-[11px] font-medium leading-[1.3] text-sam-muted dark:text-[#B0B3B8]",
  link: "font-semibold text-sam-primary dark:text-[#7EA6FF]",
  divider: "border-sam-border dark:border-[#3E4042]",
  hairline: "border-sam-border dark:border-[#3E4042]",
  searchWell: "rounded-sam-md border border-sam-border bg-sam-surface dark:bg-[#3A3F49]",
  primaryBtn:
    "rounded-sam-md bg-sam-primary px-4 py-2.5 text-[15px] font-semibold text-white active:bg-sam-primary-hover",
  secondaryBtn:
    "rounded-sam-md border border-sam-border bg-sam-surface px-4 py-2.5 text-[15px] font-semibold text-sam-fg active:bg-sam-primary-soft dark:bg-[#3A3F49] dark:text-[#E4E6EB] dark:active:bg-[#4E4F50]",
} as const;
