import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §15-2 (2026-10-25 실기기): 친구 목록을 받기 전 빈 목록을 「친구 0명」으로 써서 친구에게도 「친구 아님」 배지.
 * 잠금: 탭과 무관하게 마운트 1회 조회 · 받기 전에는 undefined(모름) 전달 · 색은 시안 값.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("friend relation badge uses known friend list only", () => {
  it("bootstrap 훅이 친구 목록 수신 여부를 알린다", () => {
    const hook = read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts");
    expect(hook).toContain("setFriendsListLoaded(true);");
    expect(hook).toContain("friendsListLoaded,");
  });

  it("홈: 마운트 1회 친구 조회 + 받기 전에는 모름(undefined)", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("const knownFriendIds = friendsListLoaded ? savedFriendIds : undefined;");
    expect(home).toContain("friendIds: knownFriendIds,");
    expect(home).not.toContain("savedFriendIds={savedFriendIds}");
    expect(home).toMatch(/if \(!homeViewerId \|\| friendsHydratedThisMountRef\.current\) return;/);
  });

  it("색 = 시안 값 (주황 #ef9f27 · 행 #fff9ef)", () => {
    const css = read("app/messenger-presentation.css");
    expect(css).toContain("--cm-peer-stranger: #ef9f27;");
    expect(css).toContain("--cm-peer-stranger-row-bg: #fff9ef;");
    const badge = read("components/community-messenger/peer-relation/MessengerPeerRelationAvatarBadge.tsx");
    expect(badge).toContain('"var(--cm-peer-stranger)"');
    expect(badge).not.toContain("--sam-warning");
  });
});
