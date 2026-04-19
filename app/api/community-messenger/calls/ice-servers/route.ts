import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
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

  const rateLimit = await enforceRateLimit({
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
  /** 주 TURN 실패·NAT 대칭 구간 대비 보조 릴레이(동일 또는 별도 Coturn 등) */
  const turnUrlsFallback = parseUrls(
    process.env.COMMUNITY_MESSENGER_TURN_FALLBACK_URLS ?? process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_FALLBACK_URLS
  );
  const turnUsername =
    process.env.COMMUNITY_MESSENGER_TURN_USERNAME?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_USERNAME?.trim() ??
    "";
  const turnCredential =
    process.env.COMMUNITY_MESSENGER_TURN_CREDENTIAL?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_CREDENTIAL?.trim() ??
    "";
  const turnUsernameFallback =
    process.env.COMMUNITY_MESSENGER_TURN_FALLBACK_USERNAME?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_FALLBACK_USERNAME?.trim() ??
    turnUsername;
  const turnCredentialFallback =
    process.env.COMMUNITY_MESSENGER_TURN_FALLBACK_CREDENTIAL?.trim() ??
    process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_TURN_FALLBACK_CREDENTIAL?.trim() ??
    turnCredential;

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
  if (turnUrlsFallback.length && turnUsernameFallback && turnCredentialFallback) {
    const sameAsPrimary =
      turnUrls.length > 0 &&
      turnUrls.join("\0") === turnUrlsFallback.join("\0") &&
      turnUsername === turnUsernameFallback &&
      turnCredential === turnCredentialFallback;
    if (!sameAsPrimary) {
      iceServers.push({
        urls: turnUrlsFallback,
        username: turnUsernameFallback,
        credential: turnCredentialFallback,
      });
    }
  }

  const turnPrimaryOk = turnUrls.length > 0 && Boolean(turnUsername && turnCredential);
  const turnFallbackOk =
    turnUrlsFallback.length > 0 && Boolean(turnUsernameFallback && turnCredentialFallback);

  return NextResponse.json({
    ok: true,
    turnEnabled: turnPrimaryOk || turnFallbackOk,
    iceServers,
  });
}
