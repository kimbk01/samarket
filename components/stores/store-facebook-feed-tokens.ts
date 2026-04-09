/**
 * Facebook 모바일 피드에 가까운 시각 토큰 — 매장 탭 피드 전용.
 * 브랜드 시그니처와 별도로, 이 화면만 메타 스타일 링크/캔버스를 씁니다.
 */
export const FB = {
  canvas: "bg-[#F0F2F5] dark:bg-[#18191A]",
  card: "rounded-ui-rect bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-white/[0.08]",
  cardFlat: "rounded-ui-rect bg-white dark:bg-[#242526] dark:ring-1 dark:ring-white/[0.08]",
  name: "text-[15px] font-semibold leading-snug text-[#050505] dark:text-[#E4E6EB]",
  body: "text-[15px] leading-snug text-[#050505] dark:text-[#E4E6EB]",
  meta: "text-[13px] leading-snug text-[#65676B] dark:text-[#B0B3B8]",
  metaSm: "text-[12px] leading-snug text-[#65676B] dark:text-[#B0B3B8]",
  link: "font-semibold text-[#1877F2] dark:text-[#4599FF]",
  divider: "border-[#E4E6EB] dark:border-[#3E4042]",
  hairline: "border-[#CED0D4] dark:border-[#3E4042]",
  searchWell: "rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C]",
  primaryBtn:
    "rounded-ui-rect bg-[#1877F2] px-3 py-2 text-[13px] font-semibold text-white active:bg-[#166FE5] dark:bg-[#2374E1] dark:active:bg-[#1877F2]",
  secondaryBtn:
    "rounded-ui-rect bg-[#E4E6EB] px-3 py-2 text-[13px] font-semibold text-[#050505] active:bg-[#D8DADF] dark:bg-[#3A3B3C] dark:text-[#E4E6EB] dark:active:bg-[#4E4F50]",
} as const;
