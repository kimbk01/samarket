"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type SendChatMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** 메시지 타입 */
export type MessagePayloadType = "text" | "image";

export type ChatImageSendPayload =
  | { type: "text"; text: string }
  | { type: "image"; text: string; imageUrl?: string; imageUrls?: string[] };

function imageUrlListFromPayload(p: ChatImageSendPayload): string[] {
  if (p.type !== "image") return [];
  if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) {
    return [...new Set(p.imageUrls.map((u) => u.trim()).filter(Boolean))];
  }
  const one = p.imageUrl?.trim() ?? "";
  return one ? [one] : [];
}

/** 테스트 로그인 시 서버 API로 전송 (RLS 우회) */
async function sendMessageViaApi(
  roomId: string,
  _userId: string,
  payload: ChatImageSendPayload
): Promise<SendChatMessageResult> {
  try {
    const isImage = payload.type === "image";
    const urls = imageUrlListFromPayload(payload);
    const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        text: payload.text,
        messageType: isImage ? "image" : "text",
        ...(isImage && urls.length === 1 ? { imageUrl: urls[0] } : {}),
        ...(isImage && urls.length > 1 ? { imageUrls: urls } : {}),
      }),
    });
    let data: { ok?: boolean; messageId?: string; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }
    if (data.ok && data.messageId) return { ok: true, messageId: data.messageId };
    const msg =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : !res.ok
          ? `전송에 실패했습니다. (${res.status})`
          : "전송에 실패했습니다. 다시 시도해 주세요.";
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "전송에 실패했습니다." };
  }
}

/**
 * 당근형: 채팅 메시지 전송
 * - 항상 API 우선 시도 → DB 저장 보장, 판매자 화면 반영
 */
export async function sendChatMessage(
  roomId: string,
  payload: ChatImageSendPayload
): Promise<SendChatMessageResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  // Message persistence and notification side effects are server-authoritative.
  // Never fall back to recipient writes from the browser.
  return sendMessageViaApi(roomId, user.id, payload);
}
