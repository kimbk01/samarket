import type { NextRequest } from "next/server";
import type { ChatRoomSource } from "@/lib/types/chat";
import { resolveLegacyProductChatCreateOrGet } from "./legacy-product-chat-create-or-get";

type UpstreamPayload = {
  ok?: boolean;
  roomId?: string;
  messengerRoomId?: string;
  error?: string;
};

type UpstreamResult = {
  status: number;
  payload: UpstreamPayload;
};

export type ResolveTradeChatEntryResult =
  | { ok: true; roomId: string; roomSource: ChatRoomSource; messengerRoomId?: string }
  | { ok: false; error: string; status: number };

function pickString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function isProductNotFound(status: number, payload: UpstreamPayload): boolean {
  const error = pickString(payload.error) ?? "";
  return status === 404 || error.includes("상품을 찾을 수 없습니다");
}

async function postUpstream(
  req: NextRequest,
  path: string,
  body: Record<string, unknown>
): Promise<UpstreamResult> {
  const url = new URL(path, req.url);
  const cookie = req.headers.get("cookie");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as UpstreamPayload;
  return {
    status: res.status,
    payload,
  };
}

export async function resolveTradeChatEntry(
  req: NextRequest,
  userId: string,
  productId: string,
  opts?: { forceNewThread?: boolean }
): Promise<ResolveTradeChatEntryResult> {
  const itemStart = await postUpstream(req, "/api/chat/item/start", {
    itemId: productId,
    ...(opts?.forceNewThread ? { forceNewThread: true } : {}),
  });
  const itemRoomId = pickString(itemStart.payload.roomId);
  const itemMessengerId = pickString(itemStart.payload.messengerRoomId);
  if (itemStart.payload.ok && itemRoomId) {
    return {
      ok: true,
      roomId: itemRoomId,
      roomSource: "chat_room",
      ...(itemMessengerId ? { messengerRoomId: itemMessengerId } : {}),
    };
  }

  if (!isProductNotFound(itemStart.status, itemStart.payload)) {
    return {
      ok: false,
      error: pickString(itemStart.payload.error) ?? "채팅방 생성에 실패했습니다.",
      status: itemStart.status >= 400 ? itemStart.status : 400,
    };
  }

  const legacy = await resolveLegacyProductChatCreateOrGet({ userId, productId });
  if (legacy.ok) {
    const legacyRoomId = pickString(legacy.messengerRoomId) ?? pickString(legacy.roomId);
    if (legacyRoomId) {
      return { ok: true, roomId: legacyRoomId, roomSource: "product_chat" };
    }
  }

  return {
    ok: false,
    error: (legacy.ok ? undefined : legacy.error) ?? pickString(itemStart.payload.error) ?? "채팅방 생성에 실패했습니다.",
    status: legacy.ok ? 500 : legacy.status,
  };
}
