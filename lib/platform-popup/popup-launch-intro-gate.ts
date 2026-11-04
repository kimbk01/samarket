/**
 * CX-01 (광고 표면 연동 · 2026-11-04): 시작 화면(인트로)이 완전히 끝나기 전(phase ≠ done)에는 팝업을 판정하지 않는다.
 *
 * `LaunchIntroRoot` 는 수정하지 않고 그 화면이 이미 내보내는 신호만 **읽는다**:
 * - 오버레이 `[data-launch-intro-overlay]` 는 showing·exiting 동안만 DOM 에 있고 done 이면 사라진다.
 * - preparing 동안은 라우트 트리(팝업 호스트 포함)가 Suspense 로 보류돼 호스트가 아직 없다.
 * - OS 해제 주인이 intro(`getLaunchOsReleaseOwner`)이고 아직 해제 전(preparing)이면 오버레이가 나올 수 있으므로,
 *   오버레이가 나왔다 사라질 때까지만 DOM 을 지켜본다(한 번 끝나면 감시를 멈춘다 — 앱 전체를 계속 감시하지 않음).
 */

import { getLaunchOsReleaseOwner, isLaunchOsReleased } from "@/lib/launch-intro/os-release-owner";

export const LAUNCH_INTRO_OVERLAY_SELECTOR = "[data-launch-intro-overlay]";

/** 인트로 오버레이가 지금 화면에 있는가 (showing·exiting) */
export function readLaunchIntroOverlayActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(LAUNCH_INTRO_OVERLAY_SELECTOR) != null;
}

let introSettled = false;

/** 같은 문서에서 인트로가 끝났다(또는 처음부터 없었다)고 확정됐는가 — 테스트용 초기화 포함 */
export function resetLaunchIntroGateForTest(): void {
  introSettled = false;
}

export function subscribeLaunchIntroOverlay(onChange: () => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  if (introSettled) return () => {};
  const present = readLaunchIntroOverlayActive();
  // 오버레이가 없고 (인트로가 OS 해제 주인이 아니거나 · 이미 OS 해제 = 인트로가 그려졌다 끝남) → 이 실행에서 더 볼 인트로 없음
  if (!present && (getLaunchOsReleaseOwner() !== "intro" || isLaunchOsReleased())) {
    introSettled = true;
    return () => {};
  }
  let seen = present;
  let last = present;
  const observer = new MutationObserver(() => {
    const now = readLaunchIntroOverlayActive();
    if (now === last) return;
    last = now;
    if (now) seen = true;
    onChange();
    if (!now && seen) {
      introSettled = true;
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
