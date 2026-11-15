import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iOS 발신음 종료 계약 — docs/audit/ios-outgoing-ringback-stop-design-2026-11-15.md (Owner 「구현 승인」 2026-11-15).
 * 통화가 끝나는 모든 정리 경로와 발신자 로컬 종료 순간에 발신음·서버 종료 감시를 직접 멈춘다
 * (Android `NativeVoice/VideoCallRuntime`·Telegram `callEnded`·Signal `outgoingRinger.stop` 과 같은 규칙).
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const owner = () => read("ios/App/App/Call/NativeOutgoingRingbackOwner.swift");
const voice = () => read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
const video = () => read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");

function body(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  const next = src.indexOf("\n  private func ", start + signature.length);
  const nextPublic = src.indexOf("\n  func ", start + signature.length);
  const ends = [next, nextPublic].filter((n) => n > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("iOS 발신음 — 정리 경로에서 직접 정지", () => {
  it("stopIfActive: 이 callId 가 지금 발신음 대상일 때만 stop (없으면 경로 초기화·기록 안 함)", () => {
    const fn = body(owner(), "func stopIfActive(callId: String, reason: String)");
    expect(fn).toContain("let owned = activeCallId == sid");
    expect(fn).toContain("guard owned else { return }");
    expect(fn).toContain("stop(callId: sid, reason: reason)");
  });

  for (const [name, src] of [
    ["음성", voice],
    ["영상", video],
  ] as const) {
    it(`${name}: 잔여 정지 함수 = 발신음 stopIfActive + 종료 감시 stop`, () => {
      const fn = body(src(), "private func stopOutgoingResiduals(sessionId sid: String, reason: String)");
      expect(fn).toContain("NativeOutgoingRingbackOwner.shared.stopIfActive(callId: sid, reason: reason)");
      expect(fn).toContain("NativeOutgoingTerminalWatch.shared.stop(callId: sid, reason: reason)");
    });

    it(`${name}: 정리 함수가 오디오 세션을 끄기 전에 잔여 정지`, () => {
      const fn = body(src(), "private func cleanup(");
      const stopAt = fn.indexOf('stopOutgoingResiduals(sessionId: sid, reason: "cleanup_\\(reason)")');
      expect(stopAt).toBeGreaterThan(-1);
      const deactivateAt = fn.search(/DibayCallAudioSessionController\.shared\.deactivate/);
      expect(deactivateAt).toBeGreaterThan(stopAt);
    });

    it(`${name}: 발신자 로컬 종료는 서버 end 응답 전에 잔여 정지`, () => {
      const src_ = src();
      const stopAt = src_.indexOf('stopOutgoingResiduals(sessionId: sid, reason: "local_end_begin")');
      expect(stopAt).toBeGreaterThan(-1);
      const endAsyncAfter = src_.indexOf("Api.endAsync(callId: sid)", stopAt);
      expect(endAsyncAfter).toBeGreaterThan(stopAt);
      expect(endAsyncAfter - stopAt).toBeLessThan(400);
    });
  }
});
