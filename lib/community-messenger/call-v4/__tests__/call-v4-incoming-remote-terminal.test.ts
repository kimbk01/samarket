/** @vitest-environment jsdom */
/**
 * 웹 V4 수신 중 원격 종료 — 단일 확인 함수 (docs/audit/call-v4-web-incoming-remote-terminal-root-cause-design-2026-11-08.md §3-1).
 * 기준은 서버 세션 상태. 신호만으로 정리하지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSession: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
  handleRemoteTerminal: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: (...a: unknown[]) => mocks.fetchSession(...a),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4HandleRemoteTerminal: (...a: unknown[]) => mocks.handleRemoteTerminal(...a),
}));

import {
  __resetCallV4IncomingRemoteTerminalForTests,
  confirmCallV4IncomingRemoteTerminal,
  isCurrentCallV4IncomingRinging,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function seed(phase: "incoming_ringing" | "accepting" | "connected" | "idle", direction: "incoming" | "outgoing" = "incoming") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId: "call-1",
    roomId: "room-1",
    callerUserId: "caller",
    calleeUserId: "me",
    direction,
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase });
}

beforeEach(() => {
  mocks.fetchSession.mockReset();
  mocks.handleRemoteTerminal.mockReset();
  mocks.handleRemoteTerminal.mockResolvedValue(undefined);
  __resetCallV4IncomingRemoteTerminalForTests();
});

describe("isCurrentCallV4IncomingRinging", () => {
  it("수신·울리는 중·같은 callId 일 때만 true", () => {
    seed("incoming_ringing");
    expect(isCurrentCallV4IncomingRinging("call-1")).toBe(true);
    expect(isCurrentCallV4IncomingRinging("call-2")).toBe(false);
    seed("accepting");
    expect(isCurrentCallV4IncomingRinging("call-1")).toBe(false);
    seed("connected");
    expect(isCurrentCallV4IncomingRinging("call-1")).toBe(false);
    seed("incoming_ringing", "outgoing");
    expect(isCurrentCallV4IncomingRinging("call-1")).toBe(false);
  });
});

describe("confirmCallV4IncomingRemoteTerminal", () => {
  it("울리는 중이 아니면 서버도 읽지 않는다", async () => {
    seed("connected");
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "t")).toBe("not_current");
    expect(mocks.fetchSession).not.toHaveBeenCalled();
  });

  it("서버가 아직 ringing 이면 정리하지 않는다(신호만으로 닫지 않음)", async () => {
    seed("incoming_ringing");
    mocks.fetchSession.mockResolvedValue({ id: "call-1", status: "ringing" });
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "t")).toBe("still_ringing");
    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "missed", "rejected", "ended", "failed"])("서버 %s 확정 → 기존 원격 종료 정리", async (status) => {
    seed("incoming_ringing");
    mocks.fetchSession.mockResolvedValue({ id: "call-1", status });
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "src")).toBe("finalized");
    expect(mocks.handleRemoteTerminal).toHaveBeenCalledWith("call-1", status, undefined, "src");
  });

  it("다른 기기에서 받음(active, 이 탭은 여전히 울리는 중) → 정리(안내는 기존 계약상 없음)", async () => {
    seed("incoming_ringing");
    mocks.fetchSession.mockResolvedValue({ id: "call-1", status: "active" });
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "src")).toBe("answered_elsewhere");
    expect(mocks.handleRemoteTerminal).toHaveBeenCalledWith("call-1", "active", undefined, "src:answered_elsewhere");
  });

  it("조회 실패·404(null)면 정리하지 않는다", async () => {
    seed("incoming_ringing");
    mocks.fetchSession.mockResolvedValue(null);
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "t")).toBe("unavailable");
    mocks.fetchSession.mockRejectedValue(new Error("offline"));
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "t")).toBe("unavailable");
    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
  });

  it("서버를 읽는 사이 이 탭에서 수락을 누르면(accepting) 손대지 않는다 — 내가 받은 통화를 다른 기기 수락으로 오판 금지", async () => {
    seed("incoming_ringing");
    mocks.fetchSession.mockImplementation(async () => {
      useCallV4Store.setState({ phase: "accepting" });
      return { id: "call-1", status: "active" };
    });
    expect(await confirmCallV4IncomingRemoteTerminal("call-1", "t")).toBe("not_current");
    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
  });

  it("같은 통화 확인이 겹치면 서버 조회는 1번", async () => {
    seed("incoming_ringing");
    let resolve: (v: unknown) => void = () => {};
    mocks.fetchSession.mockImplementation(() => new Promise((r) => (resolve = r)));
    const a = confirmCallV4IncomingRemoteTerminal("call-1", "t1");
    const b = await confirmCallV4IncomingRemoteTerminal("call-1", "t2");
    expect(b).toBe("in_flight");
    resolve({ id: "call-1", status: "cancelled" });
    expect(await a).toBe("finalized");
    expect(mocks.fetchSession).toHaveBeenCalledTimes(1);
    expect(mocks.handleRemoteTerminal).toHaveBeenCalledTimes(1);
  });
});
