import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";

/** 1단계 문서 `docs/audit/messenger-2026-10-24-stage1-ui-cta-friend-spec.md` §3·§4 (F-1~F-11) 잠금. */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("friend mutual stage2 — CTA state table (§3-1)", () => {
  const sets = {
    outgoingPendingPeerIds: new Set(["out"]),
    incomingPendingByPeerId: new Map([["in", "req-1"]]),
  };
  it("maps none / outgoing / incoming / friend / blocked", () => {
    expect(resolveMessengerPeerSocialCta({ id: "x", isFriend: false, blocked: false }, sets)).toEqual({ kind: "add_friend" });
    expect(resolveMessengerPeerSocialCta({ id: "out", isFriend: false, blocked: false }, sets)).toEqual({ kind: "pending_outgoing" });
    expect(resolveMessengerPeerSocialCta({ id: "in", isFriend: false, blocked: false }, sets)).toEqual({
      kind: "pending_incoming",
      requestId: "req-1",
    });
    expect(resolveMessengerPeerSocialCta({ id: "in", isFriend: true, blocked: false }, sets)).toEqual({ kind: "friend" });
    expect(resolveMessengerPeerSocialCta({ id: "in", isFriend: true, blocked: true }, sets)).toEqual({ kind: "blocked" });
  });
});

describe("friend mutual stage2 — wiring", () => {
  it("F-1 search rows carry the shared friend CTA and open the profile", () => {
    const sheet = src("components/community-messenger/MessengerFriendAddSheet.tsx");
    expect(sheet).toContain("MessengerFriendRelationCta");
    expect(sheet).toContain("friendActions.onOpenProfile(user)");
  });

  it("F-2·F-3 profile sheet exposes cancel / accept / reject", () => {
    const sheet = src("components/community-messenger/MessengerFriendProfileSheet.tsx");
    expect(sheet).toContain("onFriendCancel");
    expect(sheet).toContain("onFriendAccept");
    expect(sheet).toContain("onFriendReject");
    expect(sheet).not.toContain("renderFriendAddBlock");
  });

  it("F-4 room menu knows pending direction; peer notice never marks a pending request as friend", () => {
    const menu = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx");
    expect(menu).toContain("onCancelFriendRequest");
    expect(menu).toContain("onAcceptFriendRequest");
    const notice = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx");
    expect(notice).not.toContain("patchRoomSnapshotAfterFriendshipAccepted");
    expect(notice).toContain('peerFriendshipState: "pending"');
  });

  it("F-5 requests sheet has received / sent tabs", () => {
    const sheet = src("components/community-messenger/MessengerReceivedFriendRequestsSheet.tsx");
    expect(sheet).toContain('"received" | "sent"');
    expect(sheet).toContain("postCancelOutgoingCommunityMessengerFriendRequestApi");
  });

  it("F-6 global popup feed is mounted by the global host (not only messenger home)", () => {
    const host = src("components/community-messenger/GlobalIncomingFriendRequestHost.tsx");
    expect(host).toContain("useGlobalFriendRequestFeed");
    const feed = src("lib/community-messenger/realtime/use-global-friend-request-feed.ts");
    expect(feed).toContain("addressee_id=eq.");
    expect(feed).toContain("requester_id=eq.");
    const popup = src("components/community-messenger/MessengerIncomingFriendRequestPopup.tsx");
    expect(popup).toContain("DibayDialog");
    expect(popup).toContain("onGone");
  });

  it("F-6 실기기 결함(2026-10-25): 앱 복귀·재연결 시 다시 조회, 메신저 밖 안내 호스트", () => {
    const feed = src("lib/community-messenger/realtime/use-global-friend-request-feed.ts");
    expect(feed).toContain('"visibilitychange"');
    expect(feed).toContain('status === "SUBSCRIBED"');
    /** iOS WKWebView 는 앱 복귀 시 visibilitychange 미발생 — Capacitor appStateChange 필수(2026-10-25 재현) */
    expect(feed).toContain('App.addListener("appStateChange"');
    /** 구독은 공용 subscribeWithRetry(토큰 동기화·재시도) — 직접 subscribe 금지(2026-10-25 미수신 재현) */
    expect(feed).toContain("subscribeWithRetry({");
    expect(feed).not.toContain(".subscribe((status)");
    /** 시작 즉시 조회 — SUBSCRIBED 에만 의존하면 채널 미연결 시 팝업 없음(2026-10-25 회귀) */
    const start = feed.indexOf("subscribedUserId = uid;");
    expect(feed.slice(start, start + 600)).toContain("void syncPending();");
    const host = src("components/community-messenger/GlobalIncomingFriendRequestHost.tsx");
    expect(host).toContain("<MessengerSnackbarHost />");
    expect(host).toContain("insideMessengerLayout");
  });

  it("F-1 친구 탭 인라인 검색도 같은 결과 행(상태 버튼 · 프로필)", () => {
    const inline = src("components/community-messenger/MessengerHomeInlineFriendSearch.tsx");
    expect(inline).toContain("MessengerFriendSearchResultRow");
    expect(inline).toContain("useMessengerFriendActions");
  });

  it("F-8 요청 알림의 보낸 사람 이름은 받는 사람 시점(「회원님」 금지)", () => {
    const service = src("lib/community-messenger/service.ts");
    const sendFn = service.slice(service.indexOf("export async function sendCommunityMessengerFriendRequest("));
    expect(sendFn.slice(0, 3000)).toContain("hydrateProfilesLabelsOnlyWithMap(target, [userId])");
  });

  it("§11 친구 탭 상단: 글자 행 대신 아이콘 버튼 + 받은 요청이 있을 때만 카드, 내 프로필 카드 분리", () => {
    const screen = src("components/community-messenger/MessengerFriendsScreen.tsx");
    expect(screen).not.toContain("data-cm-friend-requests-entry");
    expect(screen).not.toContain("data-cm-friend-manage-entry");
    expect(screen).toContain("MessengerReceivedFriendRequestsCard");
    const sections = src("components/community-messenger/MessengerHomeMainSections.tsx");
    expect(sections).toContain("MessengerFriendsHeaderActions");
    expect(sections).toContain("MessengerReceivedFriendRequestsSheet");
    const card = src("components/community-messenger/friend-cta/MessengerReceivedFriendRequestsCard.tsx");
    expect(card).toContain("if (requests.length === 0) return null;");
    const me = src("components/community-messenger/MessengerFriendsMyProfileStrip.tsx");
    expect(me).toContain("cm_friend_my_profile_section");
    expect(me).toContain("cm_friend_my_profile_badge");
    const inline = src("components/community-messenger/MessengerHomeInlineFriendSearch.tsx");
    expect(inline).toContain("data-cm-inline-friend-search-results");
    expect(inline).toContain("absolute inset-x-0 top-full");
  });

  it("D-8~D-11 (2026-10-25 실기기): 팝업 X · 보낸 요청 카드 · 패널 바깥 클릭이 확인 팝업을 막지 않음 · 처리 즉시 제거", () => {
    const popup = src("components/community-messenger/MessengerIncomingFriendRequestPopup.tsx");
    expect(popup).toContain("cm_friend_popup_close");
    const screen = src("components/community-messenger/MessengerFriendsScreen.tsx");
    expect(screen).toContain('variant="sent"');
    const inline = src("components/community-messenger/MessengerHomeInlineFriendSearch.tsx");
    expect(inline).toContain('.dibay-overlay-root, [data-dibay-overlay]');
    const sheet = src("components/community-messenger/MessengerReceivedFriendRequestsSheet.tsx");
    expect(sheet).toContain("onChanged(request.id)");
  });

  it("D-11: 서버 목록에 없는 보낸 요청은 30초 넘으면 유지하지 않는다", async () => {
    const { mergeFriendRequestsKeepStaleOutgoingForBootstrap } = await import("@/lib/community-messenger/home-list-patch");
    const now = Date.parse("2026-10-25T06:30:00Z");
    const base = {
      me: { id: "me" },
      friends: [],
      requests: [
        { id: "old", requesterId: "me", addresseeId: "p1", status: "pending", direction: "outgoing", createdAt: "2026-10-25T06:15:00Z" },
        { id: "new", requesterId: "me", addresseeId: "p2", status: "pending", direction: "outgoing", createdAt: "2026-10-25T06:29:50Z" },
      ],
    } as never;
    const merged = mergeFriendRequestsKeepStaleOutgoingForBootstrap(base, [], now) ?? [];
    expect(merged.map((r) => r.id)).toEqual(["new"]);
  });

  it("D-12: 서버 친구 요청 목록이 홈 요청 상태의 기준 — 피드 조회 결과로 교체, 홈 진입 시 재조회 요청", () => {
    const feed = src("lib/community-messenger/realtime/use-global-friend-request-feed.ts");
    expect(feed).toContain("CM_FRIEND_REQUESTS_SYNCED_EVENT");
    expect(feed).toContain("CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT, onSyncRequest");
    const home = src("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("requests: detail.requests");
    expect(home).toContain("new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT)");
  });

  it("F-7·F-8 send / accept schedule notifications after the response", () => {
    const service = src("lib/community-messenger/service.ts");
    expect(service).toContain("notifyCommunityMessengerFriendRequestReceived");
    expect(service).toContain("notifyCommunityMessengerFriendRequestAccepted");
  });

  it("F-9 remove friend deletes both directions and closes the accepted request row", () => {
    const relations = src("lib/community-messenger/social-relations.ts");
    expect(relations).toContain("export async function removeFriendPairSaved");
    expect(relations).toMatch(/and\(owner_user_id\.eq\.\$\{owner\},target_user_id\.eq\.\$\{target\}\),and\(owner_user_id\.eq\.\$\{target\},target_user_id\.eq\.\$\{owner\}\)/);
    const service = src("lib/community-messenger/service.ts");
    const removeFn = service.slice(service.indexOf("export async function removeCommunityMessengerFriend("));
    expect(removeFn.slice(0, 2500)).toContain("removeFriendPairSaved(userId, target)");
    expect(removeFn.slice(0, 2500)).toContain('.update({ status: "cancelled"');
  });
});
