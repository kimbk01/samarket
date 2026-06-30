"use client";

import { peekBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

function mergeFriendsById(
  primary: CommunityMessengerBootstrap["friends"] | undefined,
  secondary: CommunityMessengerBootstrap["friends"] | undefined
): CommunityMessengerBootstrap["friends"] {
  const map = new Map<string, NonNullable<CommunityMessengerBootstrap["friends"]>[number]>();
  for (const friend of secondary ?? []) {
    const id = friend?.id?.trim();
    if (!id) continue;
    map.set(id, friend);
  }
  for (const friend of primary ?? []) {
    const id = friend?.id?.trim();
    if (!id) continue;
    map.set(id, { ...map.get(id), ...friend });
  }
  return [...map.values()];
}

function bootstrapFromApiJson(json: Record<string, unknown>): CommunityMessengerBootstrap | null {
  if (json.ok === false) return null;
  const { ok: _ok, bootstrap, data, ...rest } = json as {
    ok?: boolean;
    bootstrap?: CommunityMessengerBootstrap;
    data?: CommunityMessengerBootstrap;
    [key: string]: unknown;
  };
  return bootstrap ?? data ?? (rest as CommunityMessengerBootstrap);
}

/**
 * 방 안 친구 요청 수락/거절 후 — Home 이 언마운트여도 bootstrap cache 를 SSOT friends 로 맞춘다.
 * `cm.home.social_sync` 는 Home 마운트 시 `refresh(true)` 용; 여기서는 home-sync + bootstrap fresh + cache prime.
 */
export async function refreshMessengerHomeSocialClient(
  trigger: "room_friend_request_outcome" = "room_friend_request_outcome"
): Promise<boolean> {
  postCommunityMessengerBusEvent({ type: "cm.home.social_sync", at: Date.now() });
  try {
    const fetchOpts = { cache: "no-store" as RequestCache, credentials: "include" as RequestCredentials };
    const [homeSyncRes, bootstrapRes] = await Promise.all([
      fetch("/api/community-messenger/home-sync?fresh=1&tier=full", fetchOpts),
      fetch("/api/community-messenger/bootstrap?fresh=1", fetchOpts),
    ]);
    const homeSyncJson = (await homeSyncRes.json().catch(() => ({}))) as {
      ok?: boolean;
      chats?: CommunityMessengerBootstrap["chats"];
      groups?: CommunityMessengerBootstrap["groups"];
      requests?: CommunityMessengerBootstrap["requests"];
      friends?: CommunityMessengerBootstrap["friends"];
    };
    const bootstrapJson = (await bootstrapRes.json().catch(() => ({}))) as Record<string, unknown>;
    const bootstrapPayload = bootstrapFromApiJson(bootstrapJson);
    if (!homeSyncRes.ok || homeSyncJson.ok === false) return false;
    if (!bootstrapRes.ok || !bootstrapPayload) return false;

    const friends = mergeFriendsById(homeSyncJson.friends, bootstrapPayload.friends);

    const base = peekBootstrapCache() ?? bootstrapPayload;
    if (!peekBootstrapCache()) {
      primeBootstrapCache(bootstrapPayload);
    }

    const next = applyHomeListPatch(
      base,
      {
        kind: "home_sync",
        chats: homeSyncJson.chats,
        groups: homeSyncJson.groups,
        requests: homeSyncJson.requests,
        friends,
        roomMode: "replace",
      },
      trigger
    );
    const resolved = next ?? applyHomeListPatch(
      base,
      { kind: "bootstrap_full_seed", bootstrap: { ...bootstrapPayload, friends: friends ?? bootstrapPayload.friends } },
      trigger
    );
    if (!resolved) return false;
    primeBootstrapCache(resolved);
    return true;
  } catch {
    return false;
  }
}
