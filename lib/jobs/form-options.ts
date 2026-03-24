/**
 * 알바(구인) 글쓰기 폼 옵션 (당근알바 스타일)
 */

/** 구인 유형: 함께 일하실 분 / 도와주실 분 / 가르쳐 주실 분 */
export const JOB_TYPE_OPTIONS = [
  { value: "work", label: "함께 일하실 분", badge: "업무 목적", example: "예) 서빙, 주방보조, 매장관리/판매 등", icon: "work" },
  { value: "help", label: "도와주실 분", badge: "이웃알바", example: "예) 짐 옮기기, 아이 돌봄, 반려동물 돌봄 등", icon: "help" },
  { value: "teach", label: "가르쳐 주실 분", badge: "과외/레슨", example: "예) 과외, 외국어 회화, 골프 레슨 등", icon: "teach" },
] as const;

/** 근무 조건 */
export const WORK_TERM_OPTIONS = [
  { value: "short", label: "단기" },
  { value: "month_plus", label: "1개월 이상" },
  { value: "fulltime", label: "정직원" },
] as const;

/** 급여 형태 */
export const PAY_TYPE_OPTIONS = [
  { value: "hourly", label: "시급" },
  { value: "daily", label: "일급" },
  { value: "per_task", label: "건당" },
  { value: "monthly", label: "월급" },
] as const;

/** 업종(카테고리) 칩 목록 */
export const WORK_CATEGORY_OPTIONS = [
  "매장관리/판매",
  "주방보조/설거지",
  "주방장/조리사",
  "서빙",
  "배달",
  "배달업무",
  "사무보조",
  "청소",
  "재고/물류",
  "기타",
] as const;

export const JOB_TITLE_MIN = 6;
export const JOB_TITLE_MAX = 30;
export const JOB_DESCRIPTION_MAX = 2000;
/** 2026년 최저시급 (원, 한국) */
export const MIN_WAGE_2026 = 10320;
/** 필리핀 시급 하한 참고값 (PHP, 지역·업종별 상이) */
export const MIN_WAGE_PHP_HOURLY = 100;

export const JOB_TYPE_LABELS: Record<string, string> = {
  work: "함께 일하실 분",
  help: "도와주실 분",
  teach: "가르쳐 주실 분",
};

export const WORK_TERM_LABELS: Record<string, string> = {
  short: "단기",
  month_plus: "1개월 이상",
  fulltime: "정직원",
};

export const PAY_TYPE_LABELS: Record<string, string> = {
  hourly: "시급",
  daily: "일급",
  per_task: "건당",
  monthly: "월급",
};
