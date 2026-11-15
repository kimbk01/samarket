import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iOS 영상 통화 CallKit 종료 동작 — CXEnd 가 종료 기록자(음성과 같은 규칙).
 * docs/audit/ios-video-callkit-end-failing-action-plan-2026-11-16.md · Owner 「구현 승인」 2026-11-16.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ck = read("ios/App/App/Push/CallKitProvider.swift");
const videoCoord = read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");

const endAction = ck.slice(ck.indexOf("func provider(_ provider: CXProvider, perform action: CXEndCallAction)"));
const videoBranch = endAction.slice(endAction.indexOf("if isVideo {"), endAction.indexOf("deliverLegacyVideoEnd(sessionId: sessionId, action: action)"));

describe("영상 CXEndCallAction — 정리에서 종료를 다시 보고하지 않음", () => {
  it("영상 분기는 handleRejectOrEnd 전에 종료 억제·종료 완료 표시를 넣는다", () => {
    const mark = videoBranch.indexOf('markTerminalSuppressed(sessionId: sessionId, reason: "callkit_end_action")');
    const done = videoBranch.indexOf("callKitEndCompletedSessionIds.insert(sessionId)");
    const call = videoBranch.indexOf("NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId)");
    expect(mark).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(mark);
    expect(call).toBeGreaterThan(done);
    expect(videoBranch).toContain("action.fulfill()");
  });

  it("음성 분기 규칙은 그대로", () => {
    const voice = endAction.slice(endAction.indexOf('detail: "reason=callkit_end_action"'));
    expect(voice).toContain('markTerminalSuppressed(sessionId: sessionId, reason: "callkit_end_action")');
    expect(voice).toContain("fromCallKitEndAction: true");
  });

  it("영상 정리는 앱 종료 버튼·상대 종료용 CallKit 종료 보고를 그대로 갖는다", () => {
    expect(videoCoord).toMatch(/CallKitProvider\.shared\.endCallKitSession\(\s*sessionId: sid,\s*reason: \.remoteEnded,/);
  });
});
