import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 1단계 문서 §15-3 (Owner 2026-10-25 승인) — 실기기 FAIL 4건 + 친구 추가 진입점 통일 잠금 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("§15-3 friend relation states", () => {
  it("방 스냅샷: 내가 차단한 상대만 members[].blocked=true (labels-only 고정 false 정정)", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("if (peerRelation.peerBlockedByMe) {");
    expect(svc).toMatch(/member\.id === peerUserId \? \{ \.\.\.member, blocked: true \} : member/);
    expect(svc).toMatch(/membersForSnapshot = membersForSnapshot\.map\(\(member\) =>\s*member\.id === peerUserId \? \{ \.\.\.member, isFriend: true \}/);
  });

  it("친구 목록 API 가 「내 요청을 거절한 상대」를 함께 준다(null=모름)", () => {
    const route = read("app/api/community-messenger/friends/route.ts");
    expect(route).toContain("listPeerIdsWhoRejectedMyFriendRequest(auth.userId).catch(() => null)");
    expect(route).toContain("rejectedByPeerIds });");
    const rel = read("lib/community-messenger/social-relations.ts");
    expect(rel).toContain('.eq("status", "rejected")');
  });

  it("홈: 대화·통화 불가 = 차단(ready 일 때) ∪ 거절, 둘 다 모르면 undefined", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain('const blockedListKnown = privacyListsStatus === "ready";');
    expect(home).toContain("if (!blockedListKnown && !rejectedByPeerIds) return undefined;");
    expect(home).toContain("unavailablePeerIds,");
  });

  it("상대 거절 바 배경 = 시안 회색", () => {
    const bar = read("components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar.tsx");
    expect(bar).toContain('rejected_by_peer: "#f1efe8"');
  });

  it("친구 추가는 탭 줄로 — 친구 탭 검색 줄에는 관리만", () => {
    const actions = read("components/community-messenger/friend-cta/MessengerFriendsHeaderActions.tsx");
    expect(actions).not.toContain("UserPlus");
    expect(actions).not.toContain("data-cm-friend-requests-button");
    const sections = read("components/community-messenger/MessengerHomeMainSections.tsx");
    expect(sections).toContain("onOpenFriendRequests={() => openFriendRequests()}");
  });
});

describe("§15-3 차단 목록 「알 때만」 — 마운트 1회 조회 · 방 차단/해제 후 갱신 (실기기 22:06 PHT)", () => {
  it("홈: 빈 차단 목록도 마운트당 1회 idle 조회, social_sync 에서 차단 목록도 갱신", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("const privacyListsHydratedThisMountRef = useRef(false);");
    expect(home).toContain("if (!ran) privacyListsHydratedThisMountRef.current = false;");
    expect(home).toMatch(/void hydrateMessengerFriends\(\);\s*\/\*\*[^*]*\*\/\s*void hydrateMessengerPrivacyLists\(\);/);
  });
  it("방: 차단·해제 성공 후 홈 동기화 신호", () => {
    const notice = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx");
    expect(notice.match(/refreshMessengerHomeSocialClient\("room_friend_request_outcome"\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
