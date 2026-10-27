import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * FR-D3 (10-27 10:17 실기기): w 가 q 의 요청을 거절 → w 가 q 에게 요청 → q 수락으로 친구가 됐는데도
 * 옛 거절 행(q→w rejected)이 남아 q 쪽 대화·통화가 「상대가 친구 요청을 거절해…」로 막혔다.
 * 거절 판정 원천은 `fetchFriendRequestRejectedByPeer`(requester=q, addressee=w, status=rejected) 하나다.
 */
describe("FR-D3 거절한 사람이 직접 요청하면 그 거절을 해제한다", () => {
  const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
  const send = svc.slice(svc.indexOf("export async function sendCommunityMessengerFriendRequest"));
  const sendBody = send.slice(0, send.indexOf("\nexport "));
  const helper = svc.slice(svc.indexOf("async function releaseRejectedFriendRequestsFromPeerOnOwnRequest"));
  const helperBody = helper.slice(0, helper.indexOf("\n}\n") + 2);

  it("요청 성공 뒤(RPC ok) 해제를 호출한다 — 거절당한 쪽의 요청 차단 검사보다 뒤", () => {
    const rejectedGate = sendBody.indexOf("fetchFriendRequestRejectedByPeer(");
    const rpcFail = sendBody.indexOf("if (!rpc.ok)");
    const release = sendBody.indexOf("releaseRejectedFriendRequestsFromPeerOnOwnRequest(sb as any, userId, target)");
    expect(rejectedGate).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(rpcFail);
    expect(release).toBeGreaterThan(rejectedGate);
  });

  it("상대→나 방향의 rejected 행만 보관함 해제와 같은 전이(rejected → cancelled)로 닫는다", () => {
    expect(helperBody).toContain('.eq("requester_id", peerUserId)');
    expect(helperBody).toContain('.eq("addressee_id", rejecterUserId)');
    expect(helperBody).toContain('.eq("status", "rejected")');
    expect(helperBody).toContain('status: "cancelled"');
    expect(helperBody).toContain("invalidateBootstrapLiteSocialDeferredForPair(rejecterUserId, peerUserId)");
  });

  it("보관함 해제도 같은 전이다(같은 정책 한 곳)", () => {
    const rel = svc.slice(svc.indexOf("export async function releaseCommunityMessengerRejectedFriendRequest"));
    expect(rel.slice(0, 900)).toContain('.update({ status: "cancelled"');
  });
});
