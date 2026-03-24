"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type StartGroupChatResult = { ok: true; roomId: string } | { ok: false; error: string };

export async function startGroupInquiry(params: {
  peerUserId: string;
  groupId?: string | null;
  groupKey?: string | null;
}): Promise<StartGroupChatResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  const peerUserId = params.peerUserId?.trim();
  if (!peerUserId) return { ok: false, error: "대화 상대 정보가 없습니다." };
  const groupId = params.groupId?.trim();
  const groupKey = params.groupKey?.trim();
  if (!groupId && !groupKey) {
    return { ok: false, error: "모임·게시판 식별 정보가 없습니다." };
  }
  try {
    const body: Record<string, string> = { peerUserId };
    if (groupId) body.groupId = groupId;
    if (groupKey) body.groupKey = groupKey;
    const res = await fetch("/api/chat/group/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
    if (data.ok && data.roomId) return { ok: true, roomId: data.roomId };
    return { ok: false, error: data.error ?? "채팅방을 열 수 없습니다." };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방을 열 수 없습니다." };
  }
}
