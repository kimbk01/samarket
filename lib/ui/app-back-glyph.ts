/** dibaY 헤더·뒤로가기 ‹ 글리프 — 레거시 CallHeader·메신저 chevron 타이포 SSOT (`app/sector-header.css`) */
export const APP_BACK_GLYPH_CLASS = "app-back-glyph";
/** U+2039 — ASCII `<` 보다 세로 arm 이 길어 레거시 iOS형 뒤로와 동일 */
export const APP_BACK_GLYPH_CHAR = "\u2039";

/**
 * 헤더 뒤로 원형 버튼의 ‹ — SVG 꺾쇠 (설계 docs/design/header-back-round-design-2026-11-16.md R4).
 * 글자 ‹ 는 기기 글꼴이 위치를 정해 원 안에서 치우친다(실측 Mac 왼쪽 1.19·아래 3.50px, Samsung 왼쪽 0.98·아래 2.53px).
 * 좌표: 끝점 (14.75, 6.5)·(14.75, 17.5), 꼭짓점 (9.25, 12), 획 2·둥근 끝 → 잉크 x 8.25~15.75 · y 5.5~18.5 → 중심 (12, 12).
 */
export const APP_BACK_CHEVRON_CLASS = "app-back-chevron";
export const APP_BACK_CHEVRON_VIEWBOX = "0 0 24 24";
export const APP_BACK_CHEVRON_PATH = "M14.75 6.5 9.25 12l5.5 5.5";
export const APP_BACK_CHEVRON_STROKE = 2;
