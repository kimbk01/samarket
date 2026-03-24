/**
 * 매장 주문 알림음 (동네배달 신규 접수 등).
 * admin_settings `store_delivery_alert_sound` URL이 있으면 MP3/오디오 재생, 없으면 짧은 비프.
 */

const RESOLVE_TTL_MS = 60_000;
const APP_SOUND_BASE = "/api/app/store-delivery-alert-sound";

let sharedCtx: AudioContext | null = null;
let resolvedCache: { key: string; url: string | null; at: number } | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  sharedCtx = new AC();
  return sharedCtx;
}

export function invalidateStoreDeliveryAlertSoundCache(): void {
  resolvedCache = null;
}

function cacheKeyForStore(storeId?: string | null): string {
  const s = typeof storeId === "string" ? storeId.trim() : "";
  return s || "__global__";
}

async function resolveCustomSoundUrl(storeId?: string | null): Promise<string | null> {
  const key = cacheKeyForStore(storeId);
  const n = Date.now();
  if (resolvedCache && resolvedCache.key === key && n - resolvedCache.at < RESOLVE_TTL_MS) {
    return resolvedCache.url;
  }
  try {
    const q = key === "__global__" ? "" : `?storeId=${encodeURIComponent(key)}`;
    const res = await fetch(`${APP_SOUND_BASE}${q}`, { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: unknown };
    const u = typeof j.url === "string" ? j.url.trim() : "";
    resolvedCache = { key, url: u || null, at: n };
    return resolvedCache.url;
  } catch {
    resolvedCache = { key, url: null, at: n };
    return null;
  }
}

function playBuiltinBeeps(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const beep = (startAt: number, freq: number, duration: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime + startAt;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.11, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  };

  try {
    beep(0, 880, 0.12);
    beep(0.14, 660, 0.16);
  } catch {
    /* ignore */
  }
}

/** 관리자 미리듣기·프리셋「기본 비프」용 */
export function previewStoreDeliveryBuiltinSound(): void {
  playBuiltinBeeps();
}

/** 첫 클릭·탭 시 호출해 두면 이후 알림음 재생 가능성이 높아집니다. */
export function primeStoreOrderAlertAudio(storeId?: string | null): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
  void (async () => {
    const url = await resolveCustomSoundUrl(storeId);
    if (!url) return;
    try {
      const a = new Audio(url);
      a.preload = "auto";
      void a.load();
    } catch {
      /* ignore */
    }
  })();
}

/** DB에 설정된 매장 알림음 또는 기본 비프 */
export async function playStoreOrderDeliveryAlertSound(storeId?: string | null): Promise<void> {
  const url = await resolveCustomSoundUrl(storeId);
  if (url) {
    try {
      const audio = new Audio(url);
      audio.volume = 0.55;
      await audio.play().catch(() => {
        playBuiltinBeeps();
      });
      return;
    } catch {
      /* fall through */
    }
  }
  playBuiltinBeeps();
}
