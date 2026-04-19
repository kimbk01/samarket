import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createOpenGroupRoom, createPrivateGroupRoom } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import type {

  CommunityMessengerIdentityMode,
  CommunityMessengerRoomIdentityPolicy,
  CommunityMessengerRoomJoinPolicy,
} from "@/lib/community-messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-create:${getRateLimitKey(req, auth.userId)}`,
    limit: 6,
    windowMs: 60_000,
    message: "그룹 생성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_create_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: {
    groupType?: "private_group" | "open_group";
    title?: string;
    summary?: string;
    password?: string;
    memberLimit?: number;
    isDiscoverable?: boolean;
    memberIds?: string[];
    joinPolicy?: CommunityMessengerRoomJoinPolicy;
    identityPolicy?: CommunityMessengerRoomIdentityPolicy;
    creatorIdentityMode?: CommunityMessengerIdentityMode;
    creatorAliasProfile?: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.groupType === "private_group") {
    const result = await createPrivateGroupRoom({
      userId: auth.userId,
      title: String(body.title ?? ""),
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

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
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
