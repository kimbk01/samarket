/**
 * 인앱 알림(Supabase notifications INSERT)용 짧은 MP3.
 * 에셋: public/sounds/notification.mp3 (Mixkit 무료 효과음 프리뷰 기반, 교체 가능)
 */

export const NOTIFICATION_SOUND_MP3_PATH = "/sounds/notification.mp3";

let primed = false;

/** 첫 탭/클릭 후 호출해 두면 자동재생 거절 가능성을 줄입니다. */
export function primeNotificationSoundAudio(): void {
  if (typeof window === "undefined" || primed) return;
  primed = true;
  try {
    const a = new Audio(NOTIFICATION_SOUND_MP3_PATH);
    a.preload = "auto";
    void a.load();
  } catch {
    /* ignore */
  }
}

export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(NOTIFICATION_SOUND_MP3_PATH);
    audio.volume = 0.55;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
