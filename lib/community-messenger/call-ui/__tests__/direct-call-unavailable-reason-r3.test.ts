import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCallLogUnavailableReasonKey,
  resolveDirectCallUnavailableReasonKey,
} from "@/lib/community-messenger/call-ui/direct-call-unavailable-reason";

/** 1단계 문서 §17-4 R-3 (통화 규정 · Owner 2026-10-25 승인): 막힌 통화 진입 = 이유 안내, 발신 경로 무변경 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("direct call unavailable reason", () => {
  it("판정 순서: 연결 중 > (방 불가일 때) 내가 차단 > 상대 거절 > 일반", () => {
    expect(resolveDirectCallUnavailableReasonKey({ outgoingDialLocked: true, roomUnavailable: true })).toBe("cm_call_unavailable_dialing");
    expect(resolveDirectCallUnavailableReasonKey({ roomUnavailable: false, directMessageDenied: "rejected_by_peer" })).toBeNull();
    expect(resolveDirectCallUnavailableReasonKey({ roomUnavailable: true, blockedByMe: true, directMessageDenied: "blocked" })).toBe("cm_call_unavailable_blocked_by_me");
    expect(resolveDirectCallUnavailableReasonKey({ roomUnavailable: true, directMessageDenied: "rejected_by_peer" })).toBe("cm_call_unavailable_rejected");
    /** 상대가 나를 차단 — 사실 비노출, 일반 문구 */
    expect(resolveDirectCallUnavailableReasonKey({ roomUnavailable: true, directMessageDenied: "blocked", blockedByMe: false })).toBe("cm_call_unavailable_generic");
    expect(resolveCallLogUnavailableReasonKey({ blockedByMe: true })).toBe("cm_call_unavailable_blocked_by_me");
    expect(resolveCallLogUnavailableReasonKey({ blockedByMe: false })).toBe("cm_call_unavailable_rejected");
  });

  it("세 진입점: 막혀도 누름 → 이유 안내, 정상이면 기존 발신 경로 그대로", () => {
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(header).not.toContain("disabled={headerVoiceDisabled}");
    expect(header).toContain("if (headerVoiceDisabled) {");
    expect(header).toContain('void vm.startManagedDirectCall("voice");');
    const menu = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx");
    expect(menu).toMatch(/if \(explainBlockedCall\(\)\) return;\s*if \(!assertGeneralDirectCallAllowed\("voice"\)\) return;/);
    expect(menu).toMatch(/if \(explainBlockedCall\(\)\) return;\s*if \(!assertGeneralDirectCallAllowed\("video"\)\) return;/);
    const moreMenu = read("components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx");
    expect(moreMenu).not.toContain("disabled={disableVoiceCall}");
    const row = read("components/community-messenger/call-history/CommunityMessengerCallRow.tsx");
    expect(row).toContain('dimmed={relationMark === "unavailable"}');
    expect(row).toContain("onRequestOutgoingConfirm(call, vm.callKind);");
  });
});
