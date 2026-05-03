/**
 * Community Messenger — 단일 Web Audio `AudioContext` (벨·프라이밍 공용).
 * 통화 중/후 톤·해제 루프가 컨텍스트를 반복 생성·close 하면 끊김·스피커 잔류가 생기기 쉬우므로
 * `window.__CM_ACTIVE_AUDIO_CONTEXT__` 로 한 인스턴스를 유지한다.
 */
declare global {
  interface Window {
    __CM_ACTIVE_AUDIO_CONTEXT__?: AudioContext;
  }
}

function getAudioContextConstructor(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/**
 * 앱(메신저) 범위에서 1회 생성·재사용. `resume` 은 제스처 직후·벨 시작 시에도 호출해도 안전.
 */
export function ensureCommunityMessengerAppAudioContext(): AudioContext | null {
  const AC = getAudioContextConstructor();
  if (!AC) return null;
  let ctx = typeof window !== "undefined" ? window.__CM_ACTIVE_AUDIO_CONTEXT__ : undefined;
  if (!ctx || ctx.state === "closed") {
    ctx = new AC();
    if (typeof window !== "undefined") {
      window.__CM_ACTIVE_AUDIO_CONTEXT__ = ctx;
    }
  }
  try {
    void ctx.resume();
  } catch {
    /* suspended until user gesture — expected on first paint */
  }
  return ctx;
}

/** 링·피드백 중단 시 닫지 않고 suspend — 다음 통화에서 동일 컨텍스트 재사용 */
export function suspendCommunityMessengerAppAudioContextBestEffort(): void {
  if (typeof window === "undefined") return;
  const ctx = window.__CM_ACTIVE_AUDIO_CONTEXT__;
  if (!ctx || ctx.state === "closed") return;
  try {
    void ctx.suspend();
  } catch {
    /* */
  }
}
