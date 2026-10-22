"use client";

import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";

/** Client PATCH heartbeat for active call session (P4 server presence). */
export async function patchCallSessionHeartbeat(
  sessionId: string,
  input: { reconnecting?: boolean } = {},
): Promise<{ ok: boolean }> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false };
  try {
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "heartbeat",
        reconnecting: input.reconnecting === true,
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
