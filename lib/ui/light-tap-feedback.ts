/**
 * DIBAY interaction feedback SSOT — visual press stays in CSS (:active / FORM_INTERACTIVE_PRESS_CLASS).
 * Haptic/audio: coarse-pointer only; desktop/Web physical keyboard → no-op.
 *
 * Levels (do not fire on every text focus / keystroke):
 * - light: CTA tap, chip/select, toggle, send
 * - medium: destructive / hard commit confirm
 * - success | warning | error: semantic outcome (optional; skip if toast already enough)
 *
 * @see lib/ui/form-keyboard-viewport-contract.ts FORM_INTERACTIVE_PRESS_CLASS
 */

let tapAudioCtx: AudioContext | null = null;

export type InteractionFeedbackKind = "light" | "medium" | "success" | "warning" | "error";

type TapFeedbackEvent = { pointerType?: string };

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

function vibratePattern(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}

/**
 * Platform-adaptive interaction feedback. Consumers must not import Capacitor/OS APIs.
 * Fine-pointer / desktop → no-op. Coarse/touch → short vibrate (+ light click for light/medium).
 */
export function triggerInteractionFeedback(
  kind: InteractionFeedbackKind,
  ev?: TapFeedbackEvent
): void {
  try {
    if (ev?.pointerType && ev.pointerType !== "touch") return;
    if (!isCoarsePointerDevice()) return;

    switch (kind) {
      case "light":
        vibratePattern(10);
        playLightTapClickSound();
        break;
      case "medium":
        vibratePattern(18);
        playLightTapClickSound();
        break;
      case "success":
        vibratePattern([8, 40, 12]);
        break;
      case "warning":
        vibratePattern([12, 30, 12]);
        break;
      case "error":
        vibratePattern([20, 40, 20]);
        break;
      default:
        break;
    }
  } catch {
    /* noop */
  }
}

/** @deprecated Prefer `triggerInteractionFeedback("light", ev)` */
export function triggerLightTapFeedback(ev?: TapFeedbackEvent): void {
  triggerInteractionFeedback("light", ev);
}

/** @deprecated Prefer `triggerInteractionFeedback("light")` — selection / dial confirm */
export function triggerMobileSelectionFeedback(): void {
  triggerInteractionFeedback("light");
}
