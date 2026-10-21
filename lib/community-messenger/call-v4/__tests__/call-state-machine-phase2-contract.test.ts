import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { callV4CleanupOwnsGlobalState } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-types";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const identity = (callId: string) =>
  ({ callId, roomId: "r", callerUserId: "a", calleeUserId: "b", direction: "outgoing", mediaType: "audio", createdAt: "" }) satisfies CallV4Identity;

describe("C-11 이전 통화 cleanup 은 새 통화의 전역 상태를 지우지 않는다", () => {
  beforeEach(() => useCallV4Store.getState().resetToIdle());
  it("identity 가 같은 callId 일 때만 주인", () => {
    useCallV4Store.setState({ identity: identity("old"), phase: "ending" });
    expect(callV4CleanupOwnsGlobalState("old")).toBe(true);
    useCallV4Store.setState({ identity: identity("new"), phase: "outgoing_ringing" });
    expect(callV4CleanupOwnsGlobalState("old")).toBe(false);
  });
  it("identity 없이 새 발신 생성 중(creating)이면 주인이 아님, idle 이면 주인", () => {
    useCallV4Store.setState({ identity: null, phase: "creating" });
    expect(callV4CleanupOwnsGlobalState("old")).toBe(false);
    useCallV4Store.setState({ identity: null, phase: "idle" });
    expect(callV4CleanupOwnsGlobalState("old")).toBe(true);
  });
  it("await 뒤 resetToIdle 전에 다시 확인", () => {
    const src = read("lib/community-messenger/call-v4/call-v4-cleanup.ts");
    expect(src).toMatch(/if \(callV4CleanupOwnsGlobalState\(sid\)\) useCallV4Store\.getState\(\)\.resetToIdle\(\);/);
  });
});

describe("② 통화 상태 머신 서버 계약", () => {
  const svc = read("lib/community-messenger/service.ts");
  it("C-3/D4 busy 영구 기록 — call_logs(session null, cancelled, peer_busy) + busy:<uuid> stub", () => {
    expect(svc).toContain("export async function recordCommunityMessengerPeerBusyCallAttempt");
    expect(svc).toMatch(/ended_reason: "peer_busy"/);
    expect(svc).toMatch(/sessionId: `busy:\$\{randomUUID\(\)\}`/);
  });
  it("C-17 발신자 자신의 통화는 self_busy (상대 busy 기록 안 함)", () => {
    expect(svc.split('error: "self_busy"').length - 1).toBe(2);
  });
  it("#4 미접속은 증거(활성 푸시 기기 0 + presence 없음)가 있을 때만 unreachable", () => {
    expect(svc).toContain("async function resolveCalleeUnreachableEvidence");
    expect(svc).toMatch(/if \(unreachable\) er = "unreachable";/);
    expect(svc).toMatch(/if \(devErr \|\| presErr\) return false;/);
  });
  it("C-4 마감 전 missed 거절에 서버 기준 retryAfterMs", () => {
    expect(svc).toMatch(/missedGate\.error === "ring_deadline_not_reached"[\s\S]{0,400}retryAfterMs/);
    const actions = read("lib/community-messenger/call-v4/call-v4-actions.ts");
    expect(actions).toContain("missed_patch_deadline_retry_scheduled");
    expect(actions).toContain("MISSED_DEADLINE_RETRY_MAX = 2");
  });
  it("C-7 종료 신호·부재중 알림 keepAlive — missed 벨 종료 VoIP 푸시는 N-7(④)까지 보류", () => {
    expect(svc).toContain("keepAliveAfterResponse(notifyRoomBoundMissedCallBestEffort(session, mapped)");
    /** N-7 서버 경로 비활성 계약: missed 시 추가 terminal 푸시가 다시 생기지 않게 */
    expect(svc).not.toMatch(/next\.nextStatus === "missed" &&\s+peerUserId &&\s+messengerUserIdsEqual\(updated\.initiator_user_id, input\.userId\)/);
    expect(svc).toContain("N-7 네이티브 정책 준수(④)와 같은 릴리스에서 켠다");
  });
});
