/**
 * 짧은 진동(햅틱) — 주소 입력 시안 (Owner 2026-11-09 「시안대로 구현」).
 * 쓰는 곳은 세 가지뿐: 선택(라디오·칩·스위치) · 지도 핀 놓기 · 저장 성공/실패.
 * Android(WebView·Chrome)는 `navigator.vibrate`. iPhone WKWebView 는 지원하지 않아 아무 일도 하지 않는다
 * (iPhone 진동은 네이티브 진동 플러그인이 들어간 앱 빌드에서 — 웹 변경만으로는 불가).
 */
export type TapHapticKind = "select" | "drop" | "success" | "error";

const PATTERN: Record<TapHapticKind, number | number[]> = {
  select: 8,
  drop: 10,
  success: 18,
  error: [12, 40, 12],
};

export function tapHaptic(kind: TapHapticKind): void {
  try {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === "function") nav.vibrate(PATTERN[kind]);
  } catch {
    /* 진동 미지원 — 무시 */
  }
}
