/**
 * 플랫폼 운영 · 시작 화면(OS 시작·인트로) Admin 기본 색 값 — UI 토큰이 아니라 저장되는 데이터 값(#RRGGBB).
 * 인트로 문서·OS 시작 설정은 서버 검증이 6자리 hex 만 받으므로 화면 토큰(sam-*)으로 바꿀 수 없다.
 * Client-safe.
 */

/** 인트로 새 문구 기본 글자색 (문서에 저장) */
export const LAUNCH_INTRO_DEFAULT_TEXT_COLOR = "#FFFFFF";

/** OS 시작 화면 배경 기본값 (빌드 기본 배경과 같은 값) */
export const OS_LAUNCH_DEFAULT_BACKGROUND = "#075740";

/** 색 입력값이 올바르지 않을 때 색 선택기에 보여 줄 값 */
export const OS_LAUNCH_COLOR_PICKER_FALLBACK = "#000000";
