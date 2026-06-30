/**
 * 매장 주문 알림음 (동네배달 신규 접수 등) — SSOT `delivery_order_created_owner`.
 * Legacy `/api/app/store-delivery-alert-sound` URL-first 재생 없음 (mirror/read-only).
 */

import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  invalidateNotificationSoundSsotCache,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";

const STORE_DELIVERY_OWNER_EVENT_KEY = "delivery_order_created_owner";

let sharedCtx: AudioContext | null = null;

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
  invalidateNotificationSoundSsotCache();
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

/** 관리자 미리듣기·프리셋「기본 비프」용 (알림 재생 경로와 분리) */
export function previewStoreDeliveryBuiltinSound(): void {
  playBuiltinBeeps();
}

/** 첫 클릭·탭 시 호출해 두면 이후 SSOT 알림음 재생 가능성이 높아집니다. */
export function primeStoreOrderAlertAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
  const url = resolveNotificationSound(STORE_DELIVERY_OWNER_EVENT_KEY, { platform: "web" }).webUrl;
  if (!url) return;
  try {
    const a = new Audio(url);
    a.preload = "auto";
    void a.load();
  } catch {
    /* ignore */
  }
}

/** Owner 신규 주문 알림 — SSOT resolver only */
export async function playStoreOrderDeliveryAlertSound(): Promise<void> {
  await playEventNotificationSound(STORE_DELIVERY_OWNER_EVENT_KEY);
}
