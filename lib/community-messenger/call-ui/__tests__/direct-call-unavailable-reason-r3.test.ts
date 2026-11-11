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

  /**
   * 발신 창 통일 3판 (Owner 승인 2026-11-12): 모든 1:1 발신 = 통화 시트 하나.
   * R-3 계약은 유지 — 막혀도 숨기지 않고 이유를 보인다(시트 회색 버튼 + 아래 이유 / 목록 줄 흐림 + 안내), 발신 경로 무변경.
   */
  it("진입점: 막혀도 이유 안내, 정상이면 기존 발신 경로 그대로", () => {
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    /** 📞 는 막혀도 눌림(disabled 아님) → 시트에서 이유 표시 */
    expect(header).not.toMatch(/disabled=\{headerDibayAllBlocked\}/);
    expect(header).toContain("setCallChoiceOpen(true);");
    /** 진행 중 통화 → 시트 없이 그 통화로 (기존 발신 함수가 기존 세션으로 이동) */
    expect(header).toContain('void vm.startManagedDirectCall("voice");');
    expect(header).toContain("void vm.startManagedDirectCall(kind, voiceConfirmPeerLabel);");
    const sheet = read("components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx");
    expect(sheet).toContain('{!voice.enabled && !sameDibayReason ? reason("voice", t(voice.reasonKey)) : null}');
    expect(sheet).toContain('reason("video", t(video.reasonKey))');
    expect(sheet).toContain('roleTone="primary"');
    /** 방 ⋮ 메뉴에는 통화 줄이 없다 (중복 제거) */
    const moreMenu = read("components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx");
    expect(moreMenu).not.toContain("onVoiceCall");
    expect(moreMenu).not.toContain("onVideoCall");
    /** 방 안 통화 기록 말풍선: 헤더와 같은 통화 시트 — 막힌 버튼은 시트가 회색 + 이유로 보인다 (조용한 무시 없음) */
    const timeline = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx");
    expect(timeline).toContain("setStubCallSheetOpen(true);");
    expect(timeline).toContain("voice={callChoice.voice}");
    const row = read("components/community-messenger/call-history/CommunityMessengerCallRow.tsx");
    expect(row).toContain('dimmed={relationMark === "unavailable"}');
    expect(row).toContain("onRequestOutgoingConfirm(call);");
  });

  it("방 헤더는 연락처 코드를 정적으로 가져오지 않는다 (선택 시트는 📞 누를 때만 지연 import)", () => {
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(header).toContain('import("@/components/community-messenger/call-ui/MessengerCallChoiceSheet")');
    expect(header).not.toMatch(/^import [^;]*MessengerCallChoiceSheet/m);
    expect(header).not.toMatch(/contacts\//);
  });
});
