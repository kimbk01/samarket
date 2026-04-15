import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOkWithRequest,
  parseJsonBody,
} from "@/lib/http/api-route";
import {
  createOpenGroupRoom,
  createPrivateGroupRoom,
  ensureCommunityMessengerDirectRoom,
  ensureCommunityMessengerDirectRoomFromProductChat,
  ensureCommunityMessengerDirectRoomFromStoreOrderChat,
  getCommunityMessengerRoomSnapshot,
  listCommunityMessengerMyChatsAndGroups,
  syncStoreOrderCommunityMessengerRoomId,
} from "@/lib/community-messenger/service";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const listRateLimit = await enforceRateLimit({
    key: `community-messenger:rooms-list:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "대화 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_rooms_list_rate_limited",
  });
  if (!listRateLimit.ok) return listRateLimit.response;

  const { chats, groups } = await listCommunityMessengerMyChatsAndGroups(auth.userId);
  recordMessengerApiTiming("GET /api/community-messenger/rooms", Math.round(performance.now() - t0), 200);
  return jsonOkWithRequest(req, {
    chats,
    groups,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const createRateLimit = await enforceRateLimit({
    key: `community-messenger:room-create:${getRateLimitKey(req, auth.userId)}`,
    limit: 6,
    windowMs: 60_000,
    message: "대화방 생성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_create_rate_limited",
  });
  if (!createRateLimit.ok) return createRateLimit.response;

  const parsed = await parseJsonBody<{
    roomType?: "direct" | "group" | "private_group" | "open_group";
    peerUserId?: string;
    /** 스토어 주문 채팅 — 서버가 상대방을 주문 행에서만 계산(스푸핑 방지). */
    storeOrderId?: string;
    /** 중고 거래채팅(product_chats 또는 통합 item_trade id) — 참가자면 친구 없이 1:1 허용. */
    productChatRoomId?: string;
    title?: string;
    summary?: string;
    password?: string;
    memberLimit?: number;
    isDiscoverable?: boolean;
    memberIds?: string[];
    joinPolicy?: "password" | "free";
    identityPolicy?: "real_name" | "alias_allowed";
    creatorIdentityMode?: "real_name" | "alias";
    creatorAliasProfile?: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    };
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  if (body.roomType === "group" || body.roomType === "private_group") {
    const result = await createPrivateGroupRoom({
      userId: auth.userId,
      title: String(body.title ?? ""),
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return result.ok ? jsonOkWithRequest(req, result) : jsonError(result.error ?? "대화방 생성에 실패했습니다.", 400, result);
  }

  if (body.roomType === "open_group") {
    const result = await createOpenGroupRoom({
      userId: auth.userId,
      title: String(body.title ?? ""),
      summary: String(body.summary ?? ""),
      password: String(body.password ?? ""),
      memberLimit: Number(body.memberLimit ?? 200),
      isDiscoverable: body.isDiscoverable !== false,
      joinPolicy: body.joinPolicy === "free" ? "free" : "password",
      identityPolicy: body.identityPolicy === "real_name" ? "real_name" : "alias_allowed",
      creatorIdentityMode: body.creatorIdentityMode === "alias" ? "alias" : "real_name",
      creatorAliasProfile: body.creatorAliasProfile,
    });
    return result.ok ? jsonOkWithRequest(req, result) : jsonError(result.error ?? "오픈 그룹 생성에 실패했습니다.", 400, result);
  }

  const storeOrderId = typeof body.storeOrderId === "string" ? body.storeOrderId.trim() : "";
  const productChatRoomId = typeof body.productChatRoomId === "string" ? body.productChatRoomId.trim() : "";

  let result: { ok: boolean; roomId?: string; error?: string };
  if (storeOrderId) {
    result = await ensureCommunityMessengerDirectRoomFromStoreOrderChat(auth.userId, storeOrderId);
  } else if (productChatRoomId) {
    result = await ensureCommunityMessengerDirectRoomFromProductChat(auth.userId, productChatRoomId);
  } else {
    result = await ensureCommunityMessengerDirectRoom(auth.userId, String(body.peerUserId ?? ""));
  }
  if (!result.ok || !result.roomId) {
    const err = result.error ?? "room_failed";
    const status =
      err === "not_participant" ? 403 : err === "product_chat_not_found" || err === "order_chat_not_found" ? 404 : 400;
    return jsonError(result.error ?? "대화방 준비에 실패했습니다.", status, result);
  }
  if (storeOrderId) {
    await syncStoreOrderCommunityMessengerRoomId({
      userId: auth.userId,
      storeOrderId,
      communityMessengerRoomId: result.roomId,
    });
  }
  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, result.roomId);
  return jsonOkWithRequest(req, { ...result, snapshot });
}
