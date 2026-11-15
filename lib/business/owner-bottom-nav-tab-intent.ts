/**
 * 매장 사장님 하단 탭 이동 표식 — 하단 탭 계약 v2 S5 (Owner 2026-11-15 · `lib/main-menu/main-bottom-nav-interaction-contract.ts`).
 * 하단 탭으로 옮긴 이동은 전환 연출 0ms(즉시 교체) — `OwnerStackPageSlideShell` 이 이 표식을 소비하면 270ms 슬라이드를 하지 않는다.
 * 같은 경로 안의 「전체 보기」·뒤로가기 등 스택 이동은 표식이 없으므로 기존 슬라이드 그대로.
 */
const INTENT_TTL_MS = 8_000;

let pending: { path: string; at: number } | null = null;

function pathOf(href: string): string {
  const p = (href.split("?")[0] ?? "").trim().replace(/\/+$/, "");
  return p || "/";
}

export function markOwnerBottomNavTabIntent(href: string, now: number = Date.now()): void {
  pending = { path: pathOf(href), at: now };
}

/** 이번 경로 변경이 하단 탭 이동이면 true (1회 소비) */
export function consumeOwnerBottomNavTabIntent(pathname: string, now: number = Date.now()): boolean {
  const p = pending;
  if (!p) return false;
  if (now - p.at > INTENT_TTL_MS) {
    pending = null;
    return false;
  }
  if (p.path !== pathOf(pathname)) return false;
  pending = null;
  return true;
}

/** 시험 전용 */
export function __resetOwnerBottomNavTabIntentForTest(): void {
  pending = null;
}
