import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 1단계 문서 §14-5 (Owner 2026-10-25 승인, 텔레그램 기준):
 * 친구 아니어도 @아이디로 대화 가능 / 상대가 내 친구 요청을 거절하거나 차단하면 대화·친구 불가.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("friend reject / block policy (§14-5)", () => {
  it("거절 판정 원천: requester=viewer, addressee=peer, status=rejected", () => {
    const rel = src("lib/community-messenger/social-relations.ts");
    expect(rel).toContain("export async function fetchFriendRequestRejectedByPeer(");
    expect(rel).toContain('.eq("requester_id", requester)');
    expect(rel).toContain('.eq("addressee_id", addressee)');
    expect(rel).toContain('.eq("status", "rejected")');
    expect(rel).toContain('reason: "rejected"');
  });

  it("메시지 발송 게이트(텍스트·첨부 공통)가 거절을 막는다", () => {
    const gate = src("lib/community-messenger/direct-room-communication-gate.ts");
    expect(gate).toContain('return { ok: false, error: "rejected_by_peer", peerUserId };');
    const guard = src("lib/community-messenger/server/assert-messenger-room-send-allowed.ts");
    expect(guard).toContain("if (!blk.ok) return { ok: false, error: blk.error };");
    const service = src("lib/community-messenger/service.ts");
    expect(service).toContain("return { ok: false, error: blockGate.error };");
    const route = src("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    expect(route).toContain('code: "rejected_by_peer"');
  });

  it("방 열기(지난 기록)는 허용, 입력창은 사유 표시로 미리 막는다", () => {
    const service = src("lib/community-messenger/service.ts");
    expect(service).toContain('if (!guard.canMessage && guard.reason !== "rejected")');
    expect(service).toContain("if (!resolved.profile.canMessage && !resolved.profile.isRejectedByPeer)");
    expect(service).toContain('directMessageDenied = blockRel.blockedEitherWay ? "blocked" : rejectedByPeer ? "rejected_by_peer" : undefined;');
    const composer = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx");
    expect(composer).toContain('vm.snapshot.directMessageDenied === "rejected_by_peer"');
    for (const f of [
      "lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts",
      "lib/community-messenger/room/use-messenger-room-composer-surface.ts",
      "lib/community-messenger/room/use-messenger-room-composer-early.ts",
    ]) {
      expect(src(f)).toContain("directMessageDenied");
    }
  });

  it("재요청은 서버에서 먼저 막고, 거절한 사람은 보관함에서 해제할 수 있다", () => {
    const service = src("lib/community-messenger/service.ts");
    const send = service.slice(service.indexOf("export async function sendCommunityMessengerFriendRequest("));
    expect(send.slice(0, 1500)).toContain('return { ok: false, error: "request_rejected" };');
    expect(service).toContain("export async function releaseCommunityMessengerRejectedFriendRequest(");
    expect(service).toContain('.update({ status: "cancelled", responded_at: new Date().toISOString() })');
    const route = src("app/api/community-messenger/friend-requests/rejected/route.ts");
    expect(route).toContain("releaseCommunityMessengerRejectedFriendRequest");
    const archive = src("components/community-messenger/MessengerArchiveScreen.tsx");
    expect(archive).toContain("<MessengerRejectedRequestsSheet");
  });

  it("차단하면 친구 관계를 양쪽 모두 정리한다", () => {
    const service = src("lib/community-messenger/service.ts");
    const fn = service.slice(service.indexOf("export async function cleanupCommunityMessengerFriendGraphOnBlock("));
    expect(fn.slice(0, 1600)).toContain("await removeCommunityMessengerFriend(a, b)");
  });
});
