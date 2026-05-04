/**
 * 수신 친구 요청 인앱음 — 호출부에서 신규 목록 진입 시만 불리게 두고, 여기서는 레이스만 짧게 막는다.
 */
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  getNotificationSoundGateSnapshot,
  shouldPlayInAppSoundFromGate,
} from "@/lib/notifications/notification-sound-gate";

const DEDUPE_MS = 4_000;
const lastPlayAtByRequestId = new Map<string, number>();

export function playIncomingFriendRequestInAppAlert(requestId: string): void {
  const rid = requestId.trim();
  if (!rid) return;

  const now = Date.now();
  const prev = lastPlayAtByRequestId.get(rid);
  if (prev != null && now - prev < DEDUPE_MS) return;

  const surface = getNotificationSoundGateSnapshot();
  if (!surface) return;
  if (!shouldPlayInAppSoundFromGate(surface, "community_direct_chat", rid)) return;

  lastPlayAtByRequestId.set(rid, now);
  void playDomainNotificationSound("community_direct_chat");

  if (lastPlayAtByRequestId.size > 200) {
    const cutoff = now - 16_000;
    for (const [k, t] of lastPlayAtByRequestId) {
      if (t < cutoff) lastPlayAtByRequestId.delete(k);
    }
  }
}
