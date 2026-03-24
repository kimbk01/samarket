import { playNotificationSound } from "@/lib/notifications/play-notification-sound";

let cachedUrl: string | null | undefined;
let cachedAt = 0;
const CACHE_MS = 60_000;

async function resolveSoundUrl(): Promise<string | null> {
  const n = Date.now();
  if (cachedUrl !== undefined && n - cachedAt < CACHE_MS) {
    return cachedUrl;
  }
  try {
    const res = await fetch("/api/app/order-match-alert-sound", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
    cachedAt = n;
    cachedUrl = typeof j?.url === "string" && j.url.trim() ? j.url.trim() : null;
    return cachedUrl;
  } catch {
    cachedAt = n;
    cachedUrl = null;
    return null;
  }
}

export function bustOrderMatchAlertSoundCache(): void {
  cachedUrl = undefined;
  cachedAt = 0;
}

/** 어드민에 등록한 MP3가 있으면 재생, 없으면 기본 알림음 */
export async function playOrderMatchChatAlert(): Promise<void> {
  if (typeof window === "undefined") return;
  const url = await resolveSoundUrl();
  if (url) {
    try {
      const audio = new Audio(url);
      audio.volume = 0.55;
      void audio.play().catch(() => playNotificationSound());
      return;
    } catch {
      playNotificationSound();
      return;
    }
  }
  playNotificationSound();
}
