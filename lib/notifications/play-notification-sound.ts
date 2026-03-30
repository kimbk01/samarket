/**
 * 인앱 알림용 짧은 소리.
 * public/sounds/notification.wav — 플레이스홀더(향후 교체 예정).
 * HTMLAudioElement 재생 실패 시 Web Audio 비프(단일 AudioContext, suspend 시 resume).
 */

export const NOTIFICATION_SOUND_ASSET_PATH = "/sounds/notification.wav";

/** @deprecated 같은 파일 경로; 호환용. */
export const NOTIFICATION_SOUND_MP3_PATH = NOTIFICATION_SOUND_ASSET_PATH;

let primed = false;
let sharedAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AC();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playSoftBeepFallback(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const run = (): void => {
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.value = 780;
        g.gain.setValueAtTime(0.045, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.08);
      } catch {
        /* ignore */
      }
    };

    if (ctx.state === "suspended") {
      void ctx.resume().then(run);
    } else {
      run();
    }
  } catch {
    /* ignore */
  }
}

/** 첫 탭/클릭 후 호출: 프리로드 + WebKit/iOS 자동재생 잠금 해제 */
export function primeNotificationSoundAudio(): void {
  if (typeof window === "undefined" || primed) return;
  primed = true;
  try {
    void getOrCreateAudioContext()?.resume();

    const a = new Audio(NOTIFICATION_SOUND_ASSET_PATH);
    a.preload = "auto";
    void a.load();

    a.muted = true;
    a.volume = 1;
    void a
      .play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        a.volume = 0.55;
      })
      .catch(() => {
        a.muted = false;
        a.volume = 0.55;
      });
  } catch {
    /* ignore */
  }
}

export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  void getOrCreateAudioContext()?.resume();
  try {
    const audio = new Audio(NOTIFICATION_SOUND_ASSET_PATH);
    audio.volume = 0.55;
    void audio.play().catch(() => playSoftBeepFallback());
  } catch {
    playSoftBeepFallback();
  }
}
