/**
 * 도메인별 알림음 — 관리자 설정·반복·타임아웃·중단(stopNotificationPlayback).
 * 브라우저 전용.
 */
import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/play-notification-sound";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";

export type AdminSoundConfigRow = {
  type: string;
  sound_url: string | null;
  volume: number;
  repeat_count: number;
  cooldown_seconds?: number;
  enabled: boolean | null;
};

let adminCache: { items: AdminSoundConfigRow[]; fetchedAt: number } | null = null;
const CACHE_MS = 60_000;

/** DOM·Node 타이머 타입 차이 흡수 */
type TimerHandle = number | ReturnType<typeof globalThis.setTimeout>;
let maxDurationTimer: TimerHandle | null = null;
const repeatTimers: TimerHandle[] = [];

const MAX_PLAY_MS = 10_000;
const REPEAT_GAP_MS = 800;

export function stopNotificationPlayback(): void {
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
  for (const t of repeatTimers) {
    clearTimeout(t);
  }
  repeatTimers.length = 0;
}

async function loadConfig(): Promise<AdminSoundConfigRow[]> {
  if (typeof window === "undefined") return [];
  const now = Date.now();
  if (adminCache && now - adminCache.fetchedAt < CACHE_MS) {
    return adminCache.items;
  }
  try {
    const res = await fetch("/api/app/notification-sound-config", { credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: AdminSoundConfigRow[];
    };
    const items = Array.isArray(j.items) ? j.items : [];
    adminCache = { items, fetchedAt: now };
    return items;
  } catch {
    return [];
  }
}

function playOneShot(url: string, volume: number): void {
  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function fallbackBeep(): void {
  playOneShot(NOTIFICATION_SOUND_ASSET_PATH, 0.55);
}

/**
 * 도메인별 알림음. 반복·최대 재생 시간 후 자동 stop.
 */
export async function playDomainNotificationSound(domain: NotificationDomain): Promise<void> {
  if (typeof window === "undefined") return;
  stopNotificationPlayback();

  const items = await loadConfig();
  const row = items.find((x) => x.type === domain);
  const enabled = row?.enabled !== false;
  if (!enabled) {
    fallbackBeep();
    scheduleAutoStop();
    return;
  }

  const url = (row?.sound_url && String(row.sound_url).trim()) || NOTIFICATION_SOUND_ASSET_PATH;
  const vol = Number.isFinite(Number(row?.volume)) ? Number(row!.volume) : 0.7;
  const repeats = Math.max(1, Math.min(5, Math.round(Number(row?.repeat_count) || 1)));

  for (let i = 0; i < repeats; i++) {
    const t = window.setTimeout(() => {
      playOneShot(url, vol);
    }, i * REPEAT_GAP_MS);
    repeatTimers.push(t);
  }
  scheduleAutoStop();
}

function scheduleAutoStop(): void {
  maxDurationTimer = window.setTimeout(() => {
    stopNotificationPlayback();
  }, MAX_PLAY_MS);
}

export function invalidateNotificationSoundConfigCache(): void {
  adminCache = null;
}
