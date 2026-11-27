"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { pickApiErrorCode, pickApiErrorParams } from "@/lib/i18n/api-error-text";

/**
 * 실패 시 `error` = 오류 코드(서버 `code`·`error` 코드 모양, 없으면 `send_failed`·`network_error`·`login_required`).
 * 화면 문구는 `tradeChatSendErrorText`(`lib/trade/trade-api-error-text.ts`)로 그린다 — 서버 문장은 돌려주지 않는다.
 */
export type SendChatMessageResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      error: string;
      status?: number;
      params?: Record<string, string | number>;
      /** 가입·로그인 막힘 판정(`redirectForBlockedAction`)용 서버 원문 — 화면에 쓰지 않는다 */
      blockedReason?: string;
    };

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
    let data: { ok?: boolean; messageId?: string; error?: string; code?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }
    if (data.ok && data.messageId) return { ok: true, messageId: data.messageId };
    const code = pickApiErrorCode(data) ?? "send_failed";
    const params = pickApiErrorParams(data);
    const blockedReason = typeof data.error === "string" ? data.error.trim() : "";
    return {
      ok: false,
      error: code,
      status: res.status,
      ...(params ? { params } : {}),
      ...(blockedReason ? { blockedReason } : {}),
    };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * 채팅 메시지 전송
 * - 항상 API 우선 시도 → DB 저장 보장, 판매자 화면 반영
 */
export async function sendChatMessage(
  roomId: string,
  payload: ChatImageSendPayload
): Promise<SendChatMessageResult> {
  const user = getCurrentUser();
  /** `blockedReason` 은 로그인 시트 판정(`isLoginRequiredError` 의 unauthorized)용 — 화면 문구 아님 */
  if (!user?.id) return { ok: false, error: "login_required", status: 401, blockedReason: "unauthorized" };

  // Message persistence and notification side effects are server-authoritative.
  // Never fall back to recipient writes from the browser.
  return sendMessageViaApi(roomId, user.id, payload);
}
