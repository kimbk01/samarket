import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export const dynamic = "force-dynamic";

function parseUrls(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

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
