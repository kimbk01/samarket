/**
 * 모바일 탭 체감 — 짧은 진동 + 가벼운 클릭음(터치·coarse 기기만).
 */

let tapAudioCtx: AudioContext | null = null;

function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function playLightTapClickSound(): void {
  try {
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!tapAudioCtx) tapAudioCtx = new Ctor();
    if (tapAudioCtx.state === "suspended") void tapAudioCtx.resume();
    const osc = tapAudioCtx.createOscillator();
    const gain = tapAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(tapAudioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = 920;
    const t0 = tapAudioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    osc.start(t0);
    osc.stop(t0 + 0.06);
  } catch {
    /* noop */
  }
}

type TapFeedbackEvent = { pointerType?: string };

export function triggerLightTapFeedback(ev?: TapFeedbackEvent): void {
  try {
    if (ev?.pointerType && ev.pointerType !== "touch") return;
    triggerMobileSelectionFeedback();
  } catch {
    /* noop */
  }
}

/** 다이얼·확정 선택 — coarse/터치 기기에서만 진동+클릭음 */
export function triggerMobileSelectionFeedback(): void {
  try {
    if (!isCoarsePointerDevice()) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
    playLightTapClickSound();
  } catch {
    /* noop */
  }
}
