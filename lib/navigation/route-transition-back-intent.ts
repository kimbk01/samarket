/**
 * 「뒤로」 목적의 바꿔치기(`router.replace`) 다음 화면 전환을 기록 뒤로(popstate)와 같은 「뒤로」 움직임으로 표시한다.
 *
 * 왜: 화면 전환 방향은 popstate 또는 경로 깊이로 정한다(`useRouteTransitionKindRef`). 주소로 바로 들어온 화면에서
 * 고정 목적지 뒤로(`runFixedDestinationBack`)는 기록이 없어 `replace` 로 가는데, 깊이가 같은 내정보 화면끼리는
 * 「앞으로」 미끄러졌다(2026-11-28 Xiaomi 녹화: 관심이웃 관리 [완료] → 관심이웃 화면이 오른쪽에서 들어옴).
 * Owner 결정 3 「권장안대로 구현」 — 공용 규칙 하나로 고친다(관심이웃만의 예외 없음).
 *
 * 한 번만 쓴다: 다음 경로 변경에서 목적지 경로가 같고 3초 안이면 「뒤로」, 아니면 버린다.
 */
const BACK_INTENT_TTL_MS = 3000;

let pending: { path: string; at: number } | null = null;

function pathOnly(href: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "https://dibay.local";
  try {
    const p = new URL(href, base).pathname;
    return p.length > 1 ? p.replace(/\/+$/, "") : p;
  } catch {
    return href.split("?")[0] ?? href;
  }
}

export function markNextRouteTransitionBack(targetHref: string): void {
  pending = { path: pathOnly(targetHref), at: Date.now() };
}

/** 경로가 바뀔 때마다 1회 호출 — 표시는 맞든 틀리든 비운다(늦게 남은 표시가 다른 이동을 뒤로 만들지 않게) */
export function consumeRouteTransitionBackIntent(pathKey: string): boolean {
  const p = pending;
  pending = null;
  if (!p) return false;
  return p.path === pathOnly(pathKey) && Date.now() - p.at < BACK_INTENT_TTL_MS;
}
