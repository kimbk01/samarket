import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECT_CALL_API_ERROR_TO_DENY_CODE,
  DIRECT_CALL_DENY_MESSAGE_KEYS,
} from "@/lib/community-messenger/direct-call-permission-messages";
import { DIRECT_CALL_API_ERROR_BY_DENY_CODE } from "@/lib/community-messenger/direct-call-permission";

/** 1단계 문서 §14-5 · 통화 단독 커밋: 내 친구 요청을 상대가 거절하면 발신 불가(deny_peer_rejected). */
describe("direct call gate — peer rejected (§14-5)", () => {
  it("거부 코드 ↔ API 오류 ↔ 문구 키가 왕복된다", () => {
    expect(DIRECT_CALL_API_ERROR_BY_DENY_CODE.deny_peer_rejected).toBe("call_denied_peer_rejected");
    expect(DIRECT_CALL_API_ERROR_TO_DENY_CODE.call_denied_peer_rejected).toBe("deny_peer_rejected");
    expect(DIRECT_CALL_DENY_MESSAGE_KEYS.deny_peer_rejected).toBe("cm_call_deny_peer_rejected");
  });

  it("게이트는 차단·계정 제한 뒤, 방·공개범위 판정 전에 거절을 확인한다", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/direct-call-permission.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function canStartDirectCallBetweenUsers("));
    const restricted = fn.indexOf('code: "deny_deleted_account"');
    const rejected = fn.indexOf('code: "deny_peer_rejected"');
    const roomGate = fn.indexOf("evaluateRoomGate(");
    expect(rejected).toBeGreaterThan(restricted);
    expect(rejected).toBeLessThan(roomGate);
    expect(fn).toContain("fetchFriendRequestRejectedByPeer(sb as any, callerUserId, calleeUserId)");
  });
});
