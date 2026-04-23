/**
 * Instagram Direct 메시지 화면에 근접하도록 맞춘 UI 토큰.
 * 메타 공식 스펙이 아니라 모바일 앱 UI 관측·디자인 클론 자료를 참고함.
 *
 * - 본문: 12px − 1pt, 줄간격 ~1.34, 살짝 자간 축소
 * - 말풍선 열: 작은 화면에서 vw 비율 + 절대 상한, 넓은 레이아웃에서는 열 기준 % (기본 대비 +20%)
 */

export const IG_DM_BODY_TEXT =
  "text-[calc(12px-1pt)] font-normal leading-[1.34] tracking-[-0.01em]";

/** 72vw·18.5rem·65% 대비 약 1.2배 — 주문자/매장 채팅 가독성 */
export const IG_DM_BUBBLE_ROW_MAX =
  "max-w-[min(86.4vw,22.2rem)] sm:max-w-[78%]";

/** 말풍선 내부 패딩 (가로 16px에 가깝게) */
export const IG_DM_BUBBLE_PAD = "px-4 py-[10px]";
