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

/** 920Hz 55ms 「딸깍」 — 홈 누름 피드백(`home-press-feedback.ts`)도 같은 소리를 쓴다 */
export function playLightTapClickSound(): void {
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

/**
 * 하단 탭 선택 햅틱 — 네이티브 선택 햅틱(@capacitor/haptics, S4 2026-11-15).
 * - iOS: UISelectionFeedbackGenerator(Apple 「선택 바뀜」 감각). Android: 플러그인 진동 파형.
 * - Android 플러그인은 `selectionStart` 없이 `selectionChanged` 를 부르면 진동하지 않는다(8.0.2 `Haptics.java` `if (selectionStarted)`)
 *   → 항상 start → changed → end 순서로 보낸다(브리지 메시지는 보낸 순서대로 처리).
 * - 플러그인이 없는 설치본(S4 이전 바이너리)·웹 = 웹 진동(Android) / 없음(iPhone WebView). 모듈은 처음 한 번만 불러온다.
 */
type HapticsModule = typeof import("@capacitor/haptics");
let hapticsModule: HapticsModule | null = null;
let hapticsLoading = false;

function isNativeHapticsAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean };
  }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true && cap.isPluginAvailable?.("Haptics") === true;
  } catch {
    return false;
  }
}

/** 하단 탭이 그려질 때 미리 불러 둔다 — 첫 탭부터 네이티브 햅틱 */
export function prewarmBottomNavHaptics(): void {
  if (hapticsModule || hapticsLoading || !isNativeHapticsAvailable()) return;
  hapticsLoading = true;
  import("@capacitor/haptics")
    .then((m) => {
      hapticsModule = m;
    })
    .catch(() => {
      /* 불러오기 실패 — 웹 진동으로 */
    })
    .finally(() => {
      hapticsLoading = false;
    });
}

function fireNativeSelectionHaptic(m: HapticsModule): void {
  const { Haptics } = m;
  void Haptics.selectionStart()
    .then(() => Haptics.selectionChanged())
    .then(() => Haptics.selectionEnd())
    .catch(() => {
      /* 기기 미지원 — 조용히 무시 */
    });
}

/**
 * 하단 탭 선택 확정 햅틱 — 계약 v2(`lib/main-menu/main-bottom-nav-interaction-contract.ts` · Owner 2026-11-15).
 * - 손을 뗀 순간(click) 선택이 확정될 때 1회만 부른다. 손을 대는 순간(pointerdown)에는 부르지 않는다.
 * - 소리 없음(웹 오디오 「딸깍」은 하단 탭에서 쓰지 않는다).
 * - 네이티브 앱(플러그인 있음) = 네이티브 선택 햅틱, 그 밖 = 웹 진동(Android 16~21ms 실측 · iPhone WebView 는 미지원).
 */
export function triggerBottomNavSelectionFeedback(): void {
  try {
    if (isNativeHapticsAvailable()) {
      if (hapticsModule) {
        fireNativeSelectionHaptic(hapticsModule);
        return;
      }
      /** 아직 안 불러졌으면 이번 1회는 웹 진동, 다음부터 네이티브 */
      prewarmBottomNavHaptics();
    }
    if (!isCoarsePointerDevice()) return;
    vibratePattern(10);
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
