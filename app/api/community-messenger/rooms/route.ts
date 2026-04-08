import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import {
  createOpenGroupRoom,
  createPrivateGroupRoom,
  ensureCommunityMessengerDirectRoom,
  getCommunityMessengerBootstrap,
  getCommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/service";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const data = await getCommunityMessengerBootstrap(auth.userId);
  return jsonOk({
    chats: data.chats,
    groups: data.groups,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const createRateLimit = enforceRateLimit({
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
    return result.ok ? jsonOk(result) : jsonError(result.error ?? "대화방 생성에 실패했습니다.", 400, result);
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
    return result.ok ? jsonOk(result) : jsonError(result.error ?? "오픈 그룹 생성에 실패했습니다.", 400, result);
  }

  const result = await ensureCommunityMessengerDirectRoom(
    auth.userId,
    String(body.peerUserId ?? "")
  );
  if (!result.ok || !result.roomId) {
    return jsonError(result.error ?? "대화방 준비에 실패했습니다.", 400, result);
  }
  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, result.roomId);
  return jsonOk({ ...result, snapshot });
}
