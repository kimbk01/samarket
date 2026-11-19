/**
 * 고스트 통화(상대가 미디어에 한 번도 안 들어온 「통화 중」) 1단계 — 서버·웹.
 * 설계: docs/audit/call-ghost-peer-never-joined-design-2026-11-19.md (Owner 2026-11-19 「1단계 구현 승인」)
 * 실기 근거: 세션 17b42c71 — 수락 직후 거는 쪽 앱 종료 → connected 는 제안 1건뿐, 미디어 증거 0건, 6분 47초 유지.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CALL_MEDIA_NEVER_CONNECTED_AFTER_ANSWER_MS,
  CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON,
  isActiveCallMediaNeverConnected,
} from "@/lib/call/call-active-presence";
import { CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS } from "@/lib/call/call-server-heartbeat";
import { isConnectedProposalAuditOnly } from "@/lib/community-messenger/call-authority/call-connected-authority";
import {
  resolveCanonicalTerminalReason,
  resolveTerminalEndedReason,
} from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";
import { resolveProjectionFromSession } from "@/lib/community-messenger/call-authority/call-chat-projection-authority";

const ROOT = join(__dirname, "../../..");
const NOW = Date.parse("2026-11-19T02:30:00.000Z");

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("S2 isActiveCallMediaNeverConnected — 수락 후 30초 미디어 연결 0", () => {
  it("기준 시간은 기존 수락 유예 상수(30초)", () => {
    expect(CALL_MEDIA_NEVER_CONNECTED_AFTER_ANSWER_MS).toBe(CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS);
    expect(CALL_MEDIA_NEVER_CONNECTED_AFTER_ANSWER_MS).toBe(30_000);
  });

  it("고스트: active · 수락 30초 경과 · connected_at 없음 → true", () => {
    expect(
      isActiveCallMediaNeverConnected(
        { status: "active", session_mode: "direct", answered_at: isoAgo(30_000), connected_at: null, ended_at: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("수락 30초 전에는 false (실제 통화 연결 최대 5.2초 실측)", () => {
    expect(
      isActiveCallMediaNeverConnected(
        { status: "active", session_mode: "direct", answered_at: isoAgo(29_999), connected_at: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("미디어 증거로 connected_at 이 있으면 생존 신호와 무관하게 false (09-01 결정 유지)", () => {
    expect(
      isActiveCallMediaNeverConnected(
        { status: "active", session_mode: "direct", answered_at: isoAgo(600_000), connected_at: isoAgo(598_000) },
        NOW,
      ),
    ).toBe(false);
  });

  it("벨(ringing)·종료·미수락·그룹은 대상 아님", () => {
    const base = { session_mode: "direct", answered_at: isoAgo(60_000), connected_at: null };
    expect(isActiveCallMediaNeverConnected({ ...base, status: "ringing" }, NOW)).toBe(false);
    expect(isActiveCallMediaNeverConnected({ ...base, status: "ended" }, NOW)).toBe(false);
    expect(isActiveCallMediaNeverConnected({ ...base, status: "active", ended_at: isoAgo(1_000) }, NOW)).toBe(false);
    expect(isActiveCallMediaNeverConnected({ ...base, status: "active", answered_at: null }, NOW)).toBe(false);
    expect(isActiveCallMediaNeverConnected({ ...base, status: "active", session_mode: "group" }, NOW)).toBe(false);
  });

  it("session_mode 없음(구 행)은 1:1 로 본다", () => {
    expect(
      isActiveCallMediaNeverConnected({ status: "active", answered_at: isoAgo(31_000), connected_at: null }, NOW),
    ).toBe(true);
  });
});

describe("S1 isConnectedProposalAuditOnly — 제안은 1:1 에서 기록만", () => {
  it("1:1(direct·빈 값) → true, group → false", () => {
    expect(isConnectedProposalAuditOnly("direct")).toBe(true);
    expect(isConnectedProposalAuditOnly(null)).toBe(true);
    expect(isConnectedProposalAuditOnly(undefined)).toBe(true);
    expect(isConnectedProposalAuditOnly("group")).toBe(false);
  });
});

describe("S5 종료 사유 — failed_network(수락 후) = 「연결 끊김」", () => {
  const ids = { initiatorUserId: "caller", recipientUserId: "callee" };

  it("서버 종료 쓰기: 신뢰 사유 failed_network 그대로 저장", () => {
    expect(CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON).toBe("failed_network");
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON,
        actorUserId: "caller",
        answeredAt: isoAgo(40_000),
        ...ids,
      }),
    ).toBe("failed_network");
  });

  it("읽기: 수락된 통화의 failed_network → disconnected, 채팅 기록 disconnected", () => {
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "failed_network",
        answeredAt: isoAgo(40_000),
        ...ids,
      }),
    ).toBe("disconnected");
    expect(
      resolveProjectionFromSession({
        status: "ended",
        endedReason: "failed_network",
        answeredAt: isoAgo(40_000),
        ...ids,
      }).resolvedEvent,
    ).toBe("disconnected");
  });
});

describe("배선 계약 (소스)", () => {
  const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
  const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");

  it("S1: 1:1 제안 분기는 connected_at update 보다 먼저 반환한다", () => {
    const branch = service.indexOf("if (isConnectedProposalAuditOnly(session.session_mode))");
    expect(branch).toBeGreaterThan(-1);
    const update = service.indexOf(".update({ connected_at: now, updated_at: now })", branch);
    const ret = service.indexOf("return { ok: true, session: mapped };", branch);
    expect(ret).toBeGreaterThan(branch);
    expect(update).toBeGreaterThan(ret);
    expect(service.slice(branch, ret)).toContain('evidence: "client_connected_proposal", stamped: false');
  });

  it("S3: reconcile 이 connected_at 을 읽고 미디어 미연결이면 failed_network 로 종료", () => {
    const fn = service.slice(
      service.indexOf("export async function reconcileUserLiveCallSessions"),
      service.indexOf("async function getUserLiveDirectCallSessionId"),
    );
    expect(fn).toContain("answered_at, connected_at, ended_at");
    expect(fn).toContain("isActiveCallMediaNeverConnected(row)");
    expect(fn).toContain("CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON");
  });

  it("S4: 2분 정리 크론이 미디어 미연결을 failed_network 로 종료, 양쪽 끊김 규칙은 유지", () => {
    const fn = cleanup.slice(cleanup.indexOf("export async function cleanupStaleActiveCommunityMessengerCallSessions"));
    expect(fn).toContain("connected_at");
    expect(fn).toContain("isActiveCallMediaNeverConnected(row, nowMs)");
    expect(fn).toContain("CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON");
    expect(fn).toContain("canEndActiveCallForPresenceStale(presenceRow, nowMs)");
  });
});
