/**
 * 앱 본문 공통 레이아웃 — 모바일 세로 기준, 태블릿·가로에서 읽기 폭 확장
 * (ConditionalAppShell·BottomNav·피드 등 본문 컬럼에서 동일 토큰 사용)
 */

/** 메인 스크롤 영역 최대 폭 + 가운데 정렬 (태블릿·가로 모드에서 점진적으로 넓힘) */
export const APP_MAIN_COLUMN_CLASS =
  "mx-auto w-full min-w-0 max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl";

/** 본문·헤더 내부 좌우 여백 */
export const APP_MAIN_GUTTER_X_CLASS = "px-3 sm:px-4 md:px-5";

/** 상위에 GUTTER_X가 있을 때 자식을 가로 풀폭으로 맞추기(스티키 바 등) */
export const APP_MAIN_GUTTER_NEG_X_CLASS = "-mx-3 sm:-mx-4 md:-mx-5";

/** 내정보 하위 페이지 기본 본문 폭 — 모바일 1열, 태블릿부터 읽기 폭만 점진 확장 */
export const APP_MYPAGE_SUBPAGE_BODY_CLASS =
  "mx-auto w-full min-w-0 max-w-lg px-3 sm:max-w-xl sm:px-4 md:max-w-2xl md:px-5";

/** 설정·알림 등 폼형 하위 페이지 — 태블릿에서만 약간 넓혀 주고 과도한 가로 확장은 막음 */
export const APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS =
  "mx-auto w-full min-w-0 max-w-lg px-3 sm:max-w-xl sm:px-4 md:max-w-xl md:px-5";

/**
 * 본문이 `APP_MAIN_COLUMN_CLASS`(좁은 컬럼) 안에 있을 때, 1단 바 배경만 뷰포트 전폭으로 맞출 때 사용.
 * 좌우만 `-mx`로 늘리면 “컬럼 테두리”까지만 맞고 화면 끝은 안 맞음; `margin-left`만 주는 방식은 overflow/스크롤바에서 우측이 어긋나기 쉬움.
 */
/** `100vw` 대신 `dvw` — 세로 스크롤바 포함 폭으로 인한 1~2px 가로 스크롤 완화 */
export const APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS =
  "relative min-w-0 w-[100dvw] max-w-[100dvw] shrink-0 ml-[calc(50%-50dvw)]";

/** safe-area와 본문 거터(12/16/20px) 중 큰 값 — 좌·우 패딩만 */
const APP_TIER1_SAFE_X_PAD =
  "pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] md:pl-[max(1.25rem,env(safe-area-inset-left,0px))] md:pr-[max(1.25rem,env(safe-area-inset-right,0px))]";

/**
 * 뷰포트 풀폭 1단 앱바 **내부** — 기기 좌우·노치(safe-area)와 본문 거터 단계 중 큰 값.
 */
export const APP_TIER1_BAR_INNER_SAFE_X_CLASS = `box-border min-w-0 ${APP_TIER1_SAFE_X_PAD}`;

/**
 * 풀폭 앱바 안 실제 콘텐츠 — **본문 컬럼과 동일 max-w·가운데 정렬** + safe-area·거터.
 * 배경만 화면 전폭이고, 버튼·텍스트는 앱 읽기 폭 안에만 머무름(데스크톱 모바일 프레임과 본문 정렬 일치).
 */
export const APP_TIER1_BAR_INNER_ALIGNED_CLASS = `${APP_MAIN_COLUMN_CLASS} box-border min-w-0 ${APP_TIER1_SAFE_X_PAD}`;

/**
 * 메인 1단(`RegionBar`)·카테고리 서브헤더 등 헤더 **내부 행** 정렬 —
 * 본문 `APP_MAIN_COLUMN_CLASS`와 같은 max-w·거터로 좌우 끝을 맞춤(내용만 넓게 벌리지 않음).
 */
/** 1·2단 헤더 행 — 본문 컬럼과 동일 폭; 칩·텍스트 넘침은 이 박스 안에서만 처리 */
export const APP_MAIN_HEADER_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} overflow-x-hidden`;

/** 매장 스티키 바 등 — `APP_MAIN_HEADER_INNER_CLASS`와 동일 토큰 */
export const APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS = APP_MAIN_HEADER_INNER_CLASS;
