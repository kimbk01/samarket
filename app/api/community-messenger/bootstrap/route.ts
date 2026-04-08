import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";

const COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS = 8_000;

type CommunityMessengerBootstrapCacheEntry = {
  payload: Awaited<ReturnType<typeof getCommunityMessengerBootstrap>>;
  expiresAt: number;
};

const communityMessengerBootstrapCache = new Map<string, CommunityMessengerBootstrapCacheEntry>();

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  for (const [key, entry] of communityMessengerBootstrapCache) {
    if (entry.expiresAt <= Date.now()) {
      communityMessengerBootstrapCache.delete(key);
    }
  }

  let data = communityMessengerBootstrapCache.get(auth.userId)?.payload;
  if (!data || fresh) {
    data = await getCommunityMessengerBootstrap(auth.userId);
    communityMessengerBootstrapCache.set(auth.userId, {
      payload: data,
      expiresAt: Date.now() + COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS,
    });
  }
  return NextResponse.json({ ok: true, ...data });
}
