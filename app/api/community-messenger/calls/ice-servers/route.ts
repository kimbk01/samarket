import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const dynamic = "force-dynamic";

function parseUrls(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = enforceRateLimit({
    key: `community-messenger:ice-servers:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "ICE 서버 정보를 너무 자주 요청하고 있습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_ice_servers_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const stunUrls = parseUrls(
    process.env.COMMUNITY_MESSENGER_STUN_URLS ??
      process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_STUN_URLS ??
      "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
  );
  const turnUrls = parseUrls(
    process.env.COMMUNITY_MESSENGER_TURN_URLS ?? process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_URLS
  );
  const turnUsername =
    process.env.COMMUNITY_MESSENGER_TURN_USERNAME?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_USERNAME?.trim() ??
    "";
  const turnCredential =
    process.env.COMMUNITY_MESSENGER_TURN_CREDENTIAL?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_CREDENTIAL?.trim() ??
    "";

  const iceServers: RTCIceServer[] = [];
  if (stunUrls.length) {
    iceServers.push({ urls: stunUrls });
  }
  if (turnUrls.length && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return NextResponse.json({
    ok: true,
    turnEnabled: turnUrls.length > 0 && Boolean(turnUsername && turnCredential),
    iceServers,
  });
}
