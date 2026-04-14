"use client";

/**
 * GET …/api/group-chat/rooms/:roomId/bootstrap — Strict Mode·재시도 등 동시 호출 합류.
 * JSON 은 단일 파싱 결과로 공유.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type GroupChatBootstrapPayload = {
  ok?: boolean;
  room?: { id: string; title?: string; memberCount?: number };
  messages?: Record<string, unknown>[];
  error?: string;
  [key: string]: unknown;
};

export async function fetchGroupChatBootstrapDeduped(roomId: string): Promise<{
  status: number;
  data: GroupChatBootstrapPayload;
}> {
  const rid = roomId.trim();
  if (!rid) {
    return { status: 400, data: { error: "invalid_room" } };
  }
  return runSingleFlight(`group-chat:bootstrap:${rid}`, async () => {
    const res = await fetch(`/api/group-chat/rooms/${encodeURIComponent(rid)}/bootstrap`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as GroupChatBootstrapPayload;
    return { status: res.status, data };
  });
}
