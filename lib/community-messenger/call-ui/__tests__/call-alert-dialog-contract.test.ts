import { beforeEach, describe, expect, it } from "vitest";
import {
  getCallInAppNoticeSpec,
  isCallAlertDialogEvent,
  mapTerminalReasonToCallInAppNoticeEvent,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import {
  beginCallInAppNoticeScope,
  showCallInAppNotice,
  showCallInAppNoticeFromTerminalReason,
  useCallInAppNoticeStore,
} from "@/lib/community-messenger/stores/call-in-app-notice-store";

const st = () => useCallInAppNoticeStore.getState();

describe("3부 T절 — 통화 상태 → 팝업 매핑 (Owner 2026-10-21)", () => {
  it("발신자 무응답 → 「응답하지 않습니다」, 수신자 missed 는 기존 부재중 배너", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("missed", { direction: "outgoing" })).toBe("peer_no_answer");
    expect(mapTerminalReasonToCallInAppNoticeEvent("no_answer")).toBe("peer_no_answer");
    expect(mapTerminalReasonToCallInAppNoticeEvent("missed", { direction: "incoming" })).toBe("missed");
  });
  it("busy·self_busy·거절·연결 불가·끊김·실패를 서로 다른 팝업으로 구분", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("self_busy")).toBe("self_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("declined")).toBe("peer_declined");
    expect(mapTerminalReasonToCallInAppNoticeEvent("unreachable")).toBe("peer_unreachable");
    expect(mapTerminalReasonToCallInAppNoticeEvent("heartbeat_timeout")).toBe("call_disconnected");
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_dropped")).toBe("call_disconnected");
    expect(mapTerminalReasonToCallInAppNoticeEvent("failed_ice")).toBe("call_failed");
  });
  it("정상 종료·발신자 취소는 팝업 없음", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("ended")).toBeNull();
    expect(mapTerminalReasonToCallInAppNoticeEvent("canceled")).toBeNull();
  });
  it("중요 실패만 DIALOG, 재연결·네트워크 경고·부재중 알림은 배너(반복 모달 금지)", () => {
    for (const e of ["peer_busy", "peer_declined", "peer_no_answer", "peer_unreachable", "call_failed", "call_disconnected", "self_busy"] as const) {
      expect(isCallAlertDialogEvent(e)).toBe(true);
      expect(getCallInAppNoticeSpec(e).durationMs).toBeNull();
    }
    for (const e of ["reconnecting", "network_warning", "missed", "permission_required"] as const) {
      expect(isCallAlertDialogEvent(e)).toBe(false);
    }
    expect(getCallInAppNoticeSpec("self_busy").retryable).toBe(false);
    expect(getCallInAppNoticeSpec("peer_no_answer").retryable).toBe(true);
  });
});

describe("3부 U절 — 팝업 규칙", () => {
  beforeEach(() => {
    st().clear();
    beginCallInAppNoticeScope(null);
  });

  it("같은 callId·같은 종류 중복 팝업 금지", () => {
    beginCallInAppNoticeScope("c1");
    showCallInAppNoticeFromTerminalReason("declined", { callId: "c1" });
    const first = st().current!;
    showCallInAppNoticeFromTerminalReason("declined", { callId: "c1" });
    expect(st().current!.shownAt).toBe(first.shownAt);
  });

  it("닫은 통화의 늦은 이벤트는 다시 띄우지 않음", () => {
    beginCallInAppNoticeScope("c2");
    showCallInAppNoticeFromTerminalReason("missed", { callId: "c2", direction: "outgoing" });
    expect(st().current?.event).toBe("peer_no_answer");
    st().dismiss();
    showCallInAppNoticeFromTerminalReason("missed", { callId: "c2", direction: "outgoing" });
    expect(st().current).toBeNull();
  });

  it("새 통화가 시작되면 이전 통화 팝업을 닫고, 이전 callId 이벤트는 무시", () => {
    beginCallInAppNoticeScope("old");
    showCallInAppNoticeFromTerminalReason("peer_busy", { callId: "old" });
    beginCallInAppNoticeScope("new");
    expect(st().current).toBeNull();
    showCallInAppNoticeFromTerminalReason("heartbeat_timeout", { callId: "old" });
    expect(st().current).toBeNull();
    showCallInAppNoticeFromTerminalReason("heartbeat_timeout", { callId: "new" });
    expect(st().current?.event).toBe("call_disconnected");
  });

  it("팝업은 계약 문구(제목·설명) 사용 — 예전 배너 문장 override 무시, 일반 실패는 구체 사유 유지", () => {
    showCallInAppNotice({ event: "peer_busy", messageOverride: "상대방이 현재 통화중입니다." });
    expect(st().current?.title).toBeTruthy();
    expect(st().current?.message).not.toBe("상대방이 현재 통화중입니다.");
    st().clear();
    showCallInAppNotice({ event: "call_failed", messageOverride: "이 대화방에서는 지금 통화를 시작할 수 없습니다." });
    expect(st().current?.message).toBe("이 대화방에서는 지금 통화를 시작할 수 없습니다.");
  });

  it("[다시 걸기] 컨텍스트는 재시도 가능한 팝업에만", () => {
    const redial = { roomId: "r", peerUserId: "p", peerLabel: "B", kind: "voice" as const };
    showCallInAppNotice({ event: "self_busy", redial });
    expect(st().current?.redial).toBeNull();
    st().clear();
    showCallInAppNotice({ event: "peer_busy", redial });
    expect(st().current?.redial).toEqual(redial);
  });
});
