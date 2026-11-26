/**
 * 시작 화면 해제 보류 — 생명주기 이동(직전 화면 복원·안전 진입)이 예정된 문서 (2026-11-17 진입 감사 OS-2·OS-4).
 *
 * 실측: OS 가 앱을 종료한 뒤 실행하면 문서가 `/` 로 뜨고 홈이 그려지는 순간 시작 화면이 해제된 뒤,
 * `LifecycleRouteEffects` 가 직전 화면으로 `router.replace` 해 홈 0.75초 → 라운지 빈 골격으로 튀었고(OS-4),
 * 안전 진입(`/` → `/home`)에서는 흰 빈 화면 한 프레임이 보였다(OS-2).
 *
 * 규칙: 이 문서가 생명주기 이동을 할 예정이면, **시작 주소에서는 해제하지 않는다.**
 * 주소가 시작 주소를 떠난 뒤 그려진 첫 화면(이동 목적지 · 리다이렉트 · 로그인)에서 해제한다 — 인트로 넘김(DS-8)과 같은 규칙.
 * 이동을 하지 않기로 정해지면(시작 의도·사용자 이동·같은 화면) `settleLifecycleNavHold()` 로 보류를 푼다.
 * 타이머 없음. 판단은 문서당 1회, 동기(하이드레이션 전 서버 본문 해제 경로에서도 같은 답).
 */
import { getAppEntryDecision } from "@/lib/lifecycle/app-entry-kind";
import { isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

/** `LifecycleRouteEffects` 와 같은 키 — 이 문서(세션)에서 생명주기 이동을 이미 적용했는지 */
export const LIFECYCLE_NAV_APPLIED_KEY = "dibay:lifecycle:nav-applied";

function pathOnly(p: string): string {
  return (p.split(/[?#]/)[0] || "/").trim() || "/";
}

/**
 * 로그인·약관·온보딩 — 생명주기 이동(복원·Safe Entry)이 덮지 않는 화면. 단일 정의(재감사: 두 곳 복사본 → 1곳).
 * `lifecycle-route-effects.client.ts` 가 이 함수를 그대로 다시 내보낸다.
 */
export function isLifecycleAuthSurfacePath(pathname: string): boolean {
  const p = pathOnly(pathname);
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p === "/signup" ||
    p.startsWith("/signup/") ||
    p.startsWith("/auth/") ||
    p === "/onboarding" ||
    p.startsWith("/onboarding/")
  );
}

/** 두 주소가 같은 화면인가 — `/` 와 `/home` 은 같은 앱 홈 */
export function isSameLifecycleSurface(a: string, b: string): boolean {
  const x = pathOnly(a);
  const y = pathOnly(b);
  if (x === y) return true;
  return isHomeSurfacePath(x) && isHomeSurfacePath(y);
}

let evaluated = false;
let holdStartPath: string | null = null;
let settled = false;
const settledListeners = new Set<() => void>();

function computeHoldStartPath(): string | null {
  if (typeof window === "undefined") return null;
  const d = getAppEntryDecision();
  if (!d.navigateTo) return null;
  try {
    // 빌드 전 감사 W3: 「적용함」 표시는 복원·안전 진입만 쓴다(새로 켬 이동은 표시를 남기지 않음 — route effects 와 같은 규칙)
    if (d.kind !== "user_cold" && window.sessionStorage.getItem(LIFECYCLE_NAV_APPLIED_KEY) === "1") return null;
  } catch {
    /* storage unavailable: judge below */
  }
  const current = pathOnly(window.location.pathname);
  if (isLifecycleAuthSurfacePath(current)) return null;
  if (isSameLifecycleSurface(current, d.navigateTo)) return null;
  return current;
}

/** 보류 중이면 시작 주소, 아니면 null. 문서당 1회 판단. */
export function lifecycleNavHoldStartPath(): string | null {
  if (!evaluated) {
    evaluated = true;
    holdStartPath = computeHoldStartPath();
  }
  return settled ? null : holdStartPath;
}

/** 지금 주소에서 시작 화면을 해제해도 되는가 */
export function mayReleaseForLifecycleNav(currentPathname: string | null | undefined): boolean {
  const start = lifecycleNavHoldStartPath();
  if (!start) return true;
  return pathOnly(currentPathname ?? "") !== start;
}

/** 생명주기 이동을 하지 않기로 정해짐 — 지금 화면에서 해제 허용 */
export function settleLifecycleNavHold(): void {
  if (settled) return;
  settled = true;
  for (const run of [...settledListeners]) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
  settledListeners.clear();
}

/**
 * 감사 2026-11-26 D3 (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 생명주기 이동으로 목적지에 도착한 문서.
 * 실측(Samsung 아이콘 실행 · 직전 채팅방 복원): 주소가 바뀐 뒤 바로 해제 → 덮개 다음 흰 화면 약 0.6초 →
 * 「채팅방 입장 중…」 약 0.8초 → 채팅방. 도착한 뒤에도 목적지가 자리 표시면 해제를 미룬다(알림 목적지 23-9 와 같은 판정).
 * 판단은 주소로만(동기) — 셸 첫 프레임 신호가 도착 표시보다 먼저 와도 같은 답. 상한은 이동 쪽(`lifecycle-route-effects`)이 건다.
 */
let navigationIssued = false;
let destinationPaintCapped = false;

/** 생명주기 이동을 실제로 낸다(`router.replace` 직전). 이동하지 않기로 정한 문서(의도·사용자 이동·같은 화면)는 부르지 않는다. */
export function noteLifecycleNavIssued(): void {
  if (holdStartPath) navigationIssued = true;
}

/** 이 문서가 생명주기 이동을 냈고, 주소가 시작 주소를 떠났으며(목적지 도착), 상한 전인가. */
export function isLifecycleNavDestinationPaintHoldActive(currentPathname: string | null | undefined): boolean {
  if (!navigationIssued || destinationPaintCapped || !holdStartPath) return false;
  return pathOnly(currentPathname ?? "") !== holdStartPath;
}

/** 목적지 그림 대기 상한 — 지금 화면에서 해제 허용(알림 목적지 8초 상한과 같은 규칙). */
export function capLifecycleNavDestinationPaint(): void {
  destinationPaintCapped = true;
}

export function onLifecycleNavHoldSettled(run: () => void): () => void {
  if (settled) {
    run();
    return () => {};
  }
  settledListeners.add(run);
  return () => {
    settledListeners.delete(run);
  };
}

/** Tests only. */
export function __resetLifecycleNavHoldForTests(): void {
  evaluated = false;
  holdStartPath = null;
  settled = false;
  navigationIssued = false;
  destinationPaintCapped = false;
  settledListeners.clear();
}
