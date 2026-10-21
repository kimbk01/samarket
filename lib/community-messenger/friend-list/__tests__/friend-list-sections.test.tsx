/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import {
  buildFriendListSections,
  friendListRowViewModelsEqual,
} from "@/lib/community-messenger/friend-list/friend-list-sections";

const avatarRenders: Record<string, number> = {};
vi.mock("@/components/profile/SamarketUserAvatarThumb", () => ({
  SamarketUserAvatarThumb: (p: { avatarUrl: string | null }) => {
    const k = String(p.avatarUrl);
    avatarRenders[k] = (avatarRenders[k] ?? 0) + 1;
    return null;
  },
}));
vi.mock("@/components/community-messenger/friend-list/CommunityMessengerFriendPresenceLine", () => ({
  CommunityMessengerFriendPresenceDot: () => null,
  CommunityMessengerFriendPresenceLine: () => null,
}));
vi.mock("@/components/community-messenger/friend-list/CommunityMessengerFriendSection", () => ({
  CommunityMessengerFriendSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/community-messenger/MessengerFriendsMyProfileStrip", () => ({
  MessengerFriendsMyProfileStrip: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse("2026-10-21T00:00:00Z");
function friend(id: string, extra: Partial<CommunityMessengerProfileLite> = {}): CommunityMessengerProfileLite {
  return {
    id,
    label: id,
    avatarUrl: `a:${id}`,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    ...extra,
  };
}

const EMPTY = new Set<string>();

describe("P-6 friend list sections (pure)", () => {
  it("classifies favorites / new / normals and sorts rows", () => {
    const list = [
      friend("c"),
      friend("b", { isFavoriteFriend: true }),
      friend("n", { friendshipAcceptedAt: new Date(NOW - 60_000).toISOString() }),
      friend("a"),
    ];
    const s = buildFriendListSections({
      viewerUserId: "me",
      sortedFriends: list,
      friendListEpochMs: NOW,
      favoriteFriendIds: new Set(["c"]),
      hiddenFriendIds: EMPTY,
      blockedFriendIds: EMPTY,
      mutedFriendIds: EMPTY,
    });
    expect(s.favorites.map((r) => r.profileId)).toEqual(["b", "c"]);
    expect(s.newFriends.map((r) => r.profileId)).toEqual(["n"]);
    expect(s.normals.map((r) => r.profileId)).toEqual(["a"]);
  });

  it("row equality compares display fields, not identity", () => {
    const input = {
      viewerUserId: "me",
      sortedFriends: [friend("a")],
      friendListEpochMs: NOW,
      favoriteFriendIds: EMPTY,
      hiddenFriendIds: EMPTY,
      blockedFriendIds: EMPTY,
      mutedFriendIds: EMPTY,
    };
    const r1 = buildFriendListSections(input).normals[0]!;
    const r2 = buildFriendListSections(input).normals[0]!;
    expect(r1).not.toBe(r2);
    expect(friendListRowViewModelsEqual(r1, r2)).toBe(true);
    expect(friendListRowViewModelsEqual(r1, { ...r2, displayName: "x" })).toBe(false);
  });
});

describe("P-6 friend list rows are memoized", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    for (const k of Object.keys(avatarRenders)) delete avatarRenders[k];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("parent re-render with new callbacks / equal data does not re-render rows; changed row re-renders only itself", async () => {
    const { CommunityMessengerFriendList } = await import(
      "@/components/community-messenger/friend-list/CommunityMessengerFriendList"
    );
    const profiles = Array.from({ length: 20 }, (_, i) => friend(`u${String(i).padStart(2, "0")}`));
    const onOpenChat = vi.fn();
    const render = (list: CommunityMessengerProfileLite[], chat: (id: string) => void) =>
      act(() =>
        root.render(
          <CommunityMessengerFriendList
            me={null}
            sortedFriends={list}
            friendListEpochMs={NOW}
            favoriteFriendIds={EMPTY}
            hiddenFriendIds={EMPTY}
            blockedFriendIds={EMPTY}
            mutedFriendIds={EMPTY}
            onOpenProfile={() => undefined}
            onOpenChat={chat}
            onOpenFriendQuickMenu={() => undefined}
          />
        )
      );
    render(profiles, () => undefined);
    expect(avatarRenders["a:u00"]).toBe(1);
    // 새 배열·새 콜백(부모 리렌더) — 내용 동일
    render([...profiles], () => undefined);
    render([...profiles], onOpenChat);
    expect(avatarRenders["a:u00"]).toBe(1);
    expect(avatarRenders["a:u19"]).toBe(1);
    // 한 명만 바뀜 → 그 행만 다시 렌더
    const changed = profiles.map((p) => (p.id === "u05" ? { ...p, avatarUrl: "a:u05-new" } : p));
    render(changed, onOpenChat);
    expect(avatarRenders["a:u05-new"]).toBe(1);
    expect(avatarRenders["a:u00"]).toBe(1);
    // 안정 콜백이 최신 부모 콜백을 호출
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(onOpenChat).toHaveBeenCalledWith("u00");
  });
});
