"use client";

/**
 * `warm-messenger-list-bootstrap-client` 는 `cm-bootstrap-client-fetch` 등 굵은 그래프를 끌므로,
 * BottomNav·tap-prewarm 경로에서는 **정적 import 대신** 이 로더의 `import()` 단일 Promise 로만 당긴다.
 * 호출부 타이밍·`warmMessengerListBootstrapClient` 내부 single-flight·캐시 계약은 변경하지 않는다.
 */
type WarmMessengerListBootstrapModule = typeof import("@/lib/community-messenger/warm-messenger-list-bootstrap-client");

let warmMessengerListBootstrapModulePromise: Promise<WarmMessengerListBootstrapModule> | null = null;

function getWarmMessengerListBootstrapModule(): Promise<WarmMessengerListBootstrapModule> {
  if (!warmMessengerListBootstrapModulePromise) {
    warmMessengerListBootstrapModulePromise = import("@/lib/community-messenger/warm-messenger-list-bootstrap-client");
  }
  return warmMessengerListBootstrapModulePromise;
}

/** `warmMessengerListBootstrapClient()` 와 동일 호출 의미 — 모듈 평가만 청크 로드 뒤로 미룸 */
export function scheduleWarmMessengerListBootstrapClient(): void {
  if (typeof window === "undefined") return;
  void getWarmMessengerListBootstrapModule().then((mod) => {
    mod.warmMessengerListBootstrapClient();
  });
}
