/**
 * V4 HTTP facade — shared call session APIs only (no V3 imports).
 */

import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
} from "@/lib/community-messenger/call-http-actions";
import type { CommunityMessengerCallSession, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

export async function callV4FetchSession(
  callId: string
): Promise<CommunityMessengerCallSession | null> {
  return fetchCommunityMessengerCallSessionByIdClient(callId);
}

export async function callV4FetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
  const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessions?: CommunityMessengerCallSession[];
  };
  return json.ok ? (json.sessions ?? []) : [];
}

export async function callV4PatchAccept(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("accept_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "accept");
  if (result.ok) {
    logCallV4("accept_patch_done", { callId });
  }
  return result;
}

export async function callV4PatchReject(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("reject_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "reject");
  if (result.ok) {
    logCallV4("reject_patch_done", { callId, status: result.session?.status ?? null });
  } else {
    logCallV4("reject_patch_failed", { callId, error: result.error ?? null });
  }
  return result;
}

export async function callV4PatchEnd(
  callId: string,
  init?: { durationSeconds?: number; clientEndedReason?: string }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("end_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "end", init);
  if (result.ok) {
    logCallV4("end_patch_done", { callId });
  }
  return result;
}

export async function callV4FetchAgoraToken(
  callId: string
): Promise<CommunityMessengerManagedCallConnection | null> {
  const sid = callId.trim();
  if (!sid) return null;
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}/token`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connection?: CommunityMessengerManagedCallConnection;
  };
  if (!res.ok || !json.ok || !json.connection) return null;
  return json.connection;
}
