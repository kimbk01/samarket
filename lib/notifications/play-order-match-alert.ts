import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";

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

/** SSOT eventKey adapter — legacy `/api/app/order-match-alert-sound` fetch retained in resolveSoundUrl for mirror */
export async function playOrderMatchChatAlert(): Promise<void> {
  if (typeof window === "undefined") return;
  const legacyUrl = await resolveSoundUrl();
  if (legacyUrl) {
    try {
      const audio = new Audio(legacyUrl);
      audio.volume = 0.55;
      void audio.play().catch(() => void playEventNotificationSound("delivery_order_match_chat"));
      return;
    } catch {
      /* fall through */
    }
  }
  await playEventNotificationSound("delivery_order_match_chat");
}
