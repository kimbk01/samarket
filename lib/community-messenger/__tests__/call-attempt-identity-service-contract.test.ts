import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * android-caller-stuck-after-remote-missed-design §15-4 — 서버 순서 계약.
 * 생성: 차단 검사 → 시도 확인 → 삽입(client_attempt_id) → 취소 기록 재확인 → 푸시 입력 반환.
 * 취소: 취소 기록 → 시도 통화 확인 → 울리는 중이면 cancel.
 */
const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
const start = src.slice(
  src.indexOf("export async function startCommunityMessengerCallSession"),
  src.indexOf("export async function updateCommunityMessengerCallSession")
);
const cancelFn = src.slice(
  src.indexOf("export async function cancelCommunityMessengerCallAttempt"),
  src.indexOf("export async function startCommunityMessengerCallSession")
);

describe("발신 시도 서버 순서 계약", () => {
  it("시도 재사용은 차단·권한 검사 뒤", () => {
    const gate = start.indexOf("canStartDirectCallBetweenUsers");
    const attemptReuse = start.indexOf("findCallSessionByAttemptForCreate(sb, input.userId, clientAttemptId)");
    expect(gate).toBeGreaterThan(-1);
    expect(attemptReuse).toBeGreaterThan(gate);
  });

  it("삽입에 client_attempt_id 를 싣고, 삽입 뒤·푸시 입력 반환 전에 취소 기록을 다시 본다", () => {
    const insertPayload = start.indexOf("client_attempt_id: clientAttemptId } : {}");
    const insertCall = start.indexOf(".insert(insertWithDomain)");
    const recheck = start.indexOf("isCallAttemptCancelledForCreate(sb, input.userId, clientAttemptId)", insertCall);
    const pushReturn = start.indexOf("incomingCallPush:", insertCall);
    expect(insertPayload).toBeGreaterThan(-1);
    expect(insertPayload).toBeLessThan(insertCall);
    expect(recheck).toBeGreaterThan(insertCall);
    expect(recheck).toBeLessThan(pushReturn);
  });

  it("울리는 통화 넘겨받기는 두 곳 모두 순서 계약 함수만 쓰고, 이전 시도 취소 시 그 통화를 쓰지 않는다", () => {
    expect(start.split("transferRingingSessionToAttempt(").length - 1).toBe(2);
    expect(start).not.toContain(".update({ client_attempt_id: clientAttemptId })");
    expect(start).toContain('if (transfer === "transferred") return { ok: true, session: liveInRoom, reused: true };');
  });

  it("취소는 기록 먼저 → 통화 확인 → 울리는 중일 때만 cancel", () => {
    const record = cancelFn.indexOf("recordCallAttemptCancellation(sb, uid, attemptId)");
    const find = cancelFn.indexOf("findCallSessionByAttempt(sb, uid, attemptId)");
    const ringingGuard = cancelFn.indexOf('attemptSession.status !== "ringing"');
    const cancelCall = cancelFn.indexOf('action: "cancel"');
    expect(record).toBeGreaterThan(-1);
    expect(find).toBeGreaterThan(record);
    expect(ringingGuard).toBeGreaterThan(find);
    expect(cancelCall).toBeGreaterThan(ringingGuard);
  });
});
