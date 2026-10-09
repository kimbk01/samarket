/**
 * W4 — 관리자 SSOT 스냅샷 → Android 이벤트별 음원 채널 동기화 (메시지·일반 알림 전용).
 *
 * - hydrate 성공 직후 호출(fire-and-forget). 소리 재생 hot path 와 무관하며 JS 에서 HTTP 를 만들지 않는다
 *   (음원 다운로드는 네이티브 백그라운드 스레드).
 * - call_* 이벤트는 보내지 않는다 (Native Call HARD LOCK 영역 분리).
 * - 구버전 APK(syncEventSounds 미구현)·iOS·웹에서는 아무것도 하지 않는다 → 기존 기본음 그대로.
 * - 같은 내용이면 다시 보내지 않는다(프로세스 내 signature dedupe). 네이티브도 assetId/url 로 dedupe.
 */
import { registerPlugin } from "@capacitor/core";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  getNotificationSoundSsotSnapshot,
  getNotificationSoundSsotSnapshotOrigin,
  resolveNotificationSoundForEvent,
} from "@/lib/notifications/notification-sound-resolver";
import type { NotificationSoundSsotSnapshot } from "@/lib/notifications/notification-sound-resolver";

export type NativeEventSoundEntry = {
  eventKey: string;
  assetId: string;
  /** 빈 문자열 = 사용자 지정 음원 없음(기본 채널·기본음). */
  url: string;
  baseChannelId: string;
  label: string;
};

type NotificationSoundBridgeSyncPlugin = {
  syncEventSounds(options: { entries: NativeEventSoundEntry[] }): Promise<Record<string, unknown>>;
};

const Bridge = registerPlugin<NotificationSoundBridgeSyncPlugin>("NotificationSoundBridge");

let lastSyncedSignature: string | null = null;
let inFlight = false;
/** 구버전 APK — 네이티브 메서드 없음. 이 프로세스에서는 더 시도하지 않는다. */
let unsupported = false;

function absoluteHttpsUrl(raw: string | null | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return "";
  if (t.startsWith("https://")) return t;
  if (t.startsWith("/") && typeof window !== "undefined") {
    const origin = window.location?.origin ?? "";
    if (origin.startsWith("https://")) return `${origin}${t}`;
  }
  return "";
}

/** Pure — 테스트 가능. 스냅샷의 모든 비통화 이벤트에 대해 전체 상태를 만든다. */
export function buildNativeEventSoundEntries(
  snapshot: NotificationSoundSsotSnapshot = getNotificationSoundSsotSnapshot()
): NativeEventSoundEntry[] {
  const out: NativeEventSoundEntry[] = [];
  const keys = [...snapshot.events.keys()].sort();
  for (const eventKey of keys) {
    if (eventKey.startsWith("call_")) continue;
    const ev = snapshot.events.get(eventKey);
    let url = "";
    let assetId = "";
    let baseChannelId = "";
    try {
      const r = resolveNotificationSoundForEvent(eventKey, { platform: "android" });
      baseChannelId = r.androidChannelId;
      assetId = r.assetId;
      const custom = r.enabled && (r.kind === "dibay_custom" || r.kind === "dibay_default");
      url = custom ? absoluteHttpsUrl(r.webUrl) : "";
    } catch {
      continue;
    }
    if (!baseChannelId) continue;
    out.push({
      eventKey,
      assetId: url ? assetId : "",
      url,
      baseChannelId,
      label: ev?.label_ko?.trim() || eventKey,
    });
  }
  return out;
}

export function nativeEventSoundEntriesSignature(entries: NativeEventSoundEntry[]): string {
  return entries.map((e) => `${e.eventKey}|${e.assetId}|${e.url}|${e.baseChannelId}`).join("\n");
}

/** hydrate 성공 직후 호출. Android 네이티브 + 관리자 데이터 적용 상태에서만 동작. 실패는 조용히 무시. */
export async function syncNativeNotificationSoundChannelsBestEffort(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCapacitorNativePlatform()) return;
  if (getNotificationSoundSsotSnapshotOrigin() !== "hydrated") return;
  if (resolveCapacitorShellPlatform() !== "android") return;
  if (unsupported || inFlight) return;
  const entries = buildNativeEventSoundEntries();
  const signature = nativeEventSoundEntriesSignature(entries);
  if (signature === lastSyncedSignature) return;
  inFlight = true;
  try {
    await Bridge.syncEventSounds({ entries });
    lastSyncedSignature = signature;
  } catch (error) {
    // 구버전 APK(UNIMPLEMENTED) → 기본음 유지, 재시도 안 함. 일시 실패 → 다음 hydrate 에서 재시도.
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "UNIMPLEMENTED") unsupported = true;
  } finally {
    inFlight = false;
  }
}

export function resetNativeNotificationSoundChannelSyncForTests(): void {
  lastSyncedSignature = null;
  inFlight = false;
  unsupported = false;
}
