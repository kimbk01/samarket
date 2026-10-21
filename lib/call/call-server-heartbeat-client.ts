"use client";

import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";

/**
 * C-14 — 웹 경로에서 미디어 연결(Connected Gate 통과)을 확인한 callId.
 * 이후 heartbeat PATCH 에 `mediaConnected: true` 를 실어, connected PATCH 가 유실돼도
 * 서버가 `connected_at` 이 null 이고 active 일 때만 채운다(통화 시간 0 영구 기록 방지).
 * 네이티브 heartbeat(Native*CallApi)는 이 플래그를 보내지 않는다 — 기존 바이너리 영향 없음.
 */
const mediaConnectedCallIds = new Set<string>();
const MEDIA_CONNECTED_MEMORY_MAX = 8;

export function markCallSessionMediaConnectedForHeartbeat(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (!mediaConnectedCallIds.has(sid) && mediaConnectedCallIds.size >= MEDIA_CONNECTED_MEMORY_MAX) {
    const oldest = mediaConnectedCallIds.values().next().value;
    if (oldest) mediaConnectedCallIds.delete(oldest);
  }
  mediaConnectedCallIds.add(sid);
}

export function isCallSessionMediaConnectedForHeartbeat(sessionId: string): boolean {
  return mediaConnectedCallIds.has(sessionId.trim());
}

export function resetCallSessionMediaConnectedForHeartbeatForTests(): void {
  mediaConnectedCallIds.clear();
}

/** Client PATCH heartbeat for active call session (P4 server presence). */
export async function patchCallSessionHeartbeat(
  sessionId: string,
  input: { reconnecting?: boolean } = {},
): Promise<{ ok: boolean }> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false };
  const mediaConnected = mediaConnectedCallIds.has(sid);
  try {
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "heartbeat",
        reconnecting: input.reconnecting === true,
        ...(mediaConnected ? { mediaConnected: true } : {}),
      }),
    });
    if (!res.ok) {
      appendDibayCallQaLog({
        step: "heartbeat_patch_failed",
        callId: sid,
        reason: `http_${res.status}`,
        extra: { reconnecting: input.reconnecting === true },
      });
      return { ok: false };
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    const ok = json.ok === true;
    appendDibayCallQaLog({
      step: ok ? "heartbeat_patch_ok" : "heartbeat_patch_failed",
      callId: sid,
      extra: { reconnecting: input.reconnecting === true },
    });
    return { ok };
  } catch (err) {
    appendDibayCallQaLog({
      step: "heartbeat_patch_failed",
      callId: sid,
      reason: "network_error",
      extra: { reconnecting: input.reconnecting === true, err: String(err) },
    });
    return { ok: false };
  }
}
