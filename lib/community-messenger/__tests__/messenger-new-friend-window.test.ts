import { describe, expect, it } from "vitest";
import {
  isMessengerNewFriend,
  MESSENGER_HOME_NEW_FRIENDS_SECTION_WINDOW_MS,
  partitionMessengerFriendsByNew,
  selectMessengerHomeNewFriends,
} from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

function friend(id: string, acceptedAt: string | null): CommunityMessengerProfileLite {
  return {
    id,
    label: id,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    friendshipAcceptedAt: acceptedAt,
  };
}

describe("messenger-new-friend-window", () => {
  const now = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("detects friends accepted within 24 hours", () => {
    expect(isMessengerNewFriend(friend("a", "2026-06-14T12:00:00.000Z"), now)).toBe(true);
    expect(isMessengerNewFriend(friend("b", "2026-06-14T11:59:59.000Z"), now)).toBe(false);
    expect(isMessengerNewFriend(friend("c", null), now)).toBe(false);
  });

  it("partitions new and regular friends", () => {
    const friends = [
      friend("new", "2026-06-14T12:00:00.000Z"),
      friend("old", "2026-05-01T12:00:00.000Z"),
    ];
    const { newFriends, regularFriends } = partitionMessengerFriendsByNew(friends, now);
    expect(newFriends.map((f) => f.id)).toEqual(["new"]);
    expect(regularFriends.map((f) => f.id)).toEqual(["old"]);
  });

  it("moves friend to regular section after 24-hour window", () => {
    const acceptedAt = "2026-06-14T12:00:00.000Z";
    const friends = [friend("edge", acceptedAt)];
    const beforeExpiry = new Date("2026-06-15T11:59:59.000Z").getTime();
    const afterExpiry = new Date("2026-06-15T12:00:01.000Z").getTime();
    expect(partitionMessengerFriendsByNew(friends, beforeExpiry).newFriends).toHaveLength(1);
    expect(partitionMessengerFriendsByNew(friends, afterExpiry).regularFriends).toHaveLength(1);
  });
});

describe("친구 탭 「새 친구」 — 최근 7일 (채팅 시안 4판)", () => {
  const now = new Date("2026-11-10T12:00:00.000Z").getTime();
  it("7일 안에 친구가 된 사람만, 최근 순", () => {
    const list = [
      friend("old", "2026-11-03T11:59:59.000Z"),
      friend("edge", "2026-11-03T12:00:00.000Z"),
      friend("recent", "2026-11-10T09:00:00.000Z"),
      friend("mid", "2026-11-07T09:00:00.000Z"),
      friend("none", null),
      friend("bad", "not-a-date"),
    ];
    expect(selectMessengerHomeNewFriends(list, now).map((f) => f.id)).toEqual(["recent", "mid", "edge"]);
  });

  it("친구가 아니면 넣지 않고, 기기 시계가 조금 늦어 방금 수락이 미래로 보여도 넣는다", () => {
    const notFriend = { ...friend("x", "2026-11-10T11:00:00.000Z"), isFriend: false };
    expect(selectMessengerHomeNewFriends([notFriend], now)).toEqual([]);
    expect(selectMessengerHomeNewFriends([friend("skew", "2026-11-10T12:01:00.000Z")], now).map((f) => f.id)).toEqual([
      "skew",
    ]);
    expect(MESSENGER_HOME_NEW_FRIENDS_SECTION_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
