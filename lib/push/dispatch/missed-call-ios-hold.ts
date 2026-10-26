import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * D-2 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1): 부재중 일반 알림이 iPhone 수신 화면보다 먼저 옴.
 *
 * 서버 무응답 마감 = 세션 시작 + 30초, iPhone 벨 = VoIP 받은 뒤 + 30초(`NativeVoiceCallRuntime.swift` 30s)라
 * 부재중 일반 APNs 가 iPhone 화면이 닫히기 1.5~2.5초 전에 도착했다(운영 실측: VoIP→부재중 발송 31.6~32.5초).
 * 이번 세션 VoIP 를 받은 iOS 기기의 일반 APNs 부재중만 「VoIP 발송 + 30초 + 5초」까지 늦춘다(최대 10초 대기).
 * 다른 기기(Android FCM·웹·VoIP 없던 iOS)와 VoIP 발송은 바꾸지 않는다.
 */

/** iPhone 네이티브 수신 벨 시간 — `NativeVoiceCallRuntime` / `NativeVideoCallRuntime` 의 30초와 같음 */
export const MISSED_CALL_IOS_NATIVE_RING_MS = 30_000;
/** VoIP 도착·타이머 시작 지연 여유 — `CALL_ACCEPT_RING_DEADLINE_GRACE_MS` 와 같은 값 */
export const MISSED_CALL_IOS_HOLD_GRACE_MS = 5_000;
/** 함수 실행 시간 보호 — 이보다 오래 기다리지 않는다 */
export const MISSED_CALL_IOS_HOLD_MAX_WAIT_MS = 10_000;

export function missedCallIosHoldWaitMs(voipSentAtMs: number, nowMs: number): number {
  if (!Number.isFinite(voipSentAtMs)) return 0;
  const holdUntil = voipSentAtMs + MISSED_CALL_IOS_NATIVE_RING_MS + MISSED_CALL_IOS_HOLD_GRACE_MS;
  return Math.min(MISSED_CALL_IOS_HOLD_MAX_WAIT_MS, Math.max(0, holdUntil - nowMs));
}

/** 보류 대상 기기를 맨 뒤로 — 다른 기기는 기다리지 않고 먼저 보낸다 */
export function orderTargetsForMissedCallIosHold<T extends { push_provider: string; device_id?: string | null }>(
  targets: T[],
  voipSentAtByDevice: ReadonlyMap<string, number>
): T[] {
  if (voipSentAtByDevice.size === 0) return targets;
  const held = (t: T) => t.push_provider === "apns" && voipSentAtByDevice.has(String(t.device_id ?? "").trim());
  return [...targets.filter((t) => !held(t)), ...targets.filter(held)];
}

/**
 * 발송 기록의 `device_id` 는 `user_devices` 행 id(VoIP 행) — 같은 iPhone 설치(`device_id` 필드)의 일반 APNs 행과
 * 맞추려면 지금 대상 목록의 VoIP 행으로 설치 id 를 찾아 바꾼다.
 */
export function mapVoipSentToInstallDevice(
  voipSentAtByRowId: ReadonlyMap<string, number>,
  targets: ReadonlyArray<{ id: string; push_provider: string; device_id?: string | null }>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of targets) {
    if (t.push_provider !== "voip_apns") continue;
    const at = voipSentAtByRowId.get(t.id);
    const install = String(t.device_id ?? "").trim();
    if (at == null || !install) continue;
    const prev = out.get(install);
    if (prev == null || at < prev) out.set(install, at);
  }
  return out;
}

/** 이번 세션에서 이 사용자 VoIP 행(`user_devices.id`)으로 수신이 「sent」된 시각(행별 가장 이른 값) */
export async function loadMissedCallIosVoipSentAtByDevice(
  svc: SupabaseClient,
  args: { userId: string; sessionId: string }
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data } = await svc
      .from("notification_deliveries")
      .select("device_id, created_at, provider_response")
      .eq("user_id", args.userId)
      /** (user_id, created_at) 인덱스 범위로 — 부재중은 세션 시작 30초 뒤라 10분이면 충분 */
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .eq("target_id", args.sessionId)
      .eq("event_type", "call_ringing")
      .eq("status", "sent");
    for (const row of (data ?? []) as Array<{ device_id: string | null; created_at: string; provider_response: unknown }>) {
      const provider = (row.provider_response as { push_provider?: unknown } | null)?.push_provider;
      if (provider !== "voip_apns") continue;
      const rowId = String(row.device_id ?? "").trim();
      const at = Date.parse(row.created_at);
      if (!rowId || !Number.isFinite(at)) continue;
      const prev = out.get(rowId);
      if (prev == null || at < prev) out.set(rowId, at);
    }
  } catch {
    /* 조회 실패 — 지금처럼 즉시 보낸다 */
  }
  return out;
}
