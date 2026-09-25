import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyCallTerminalReason,
  mapTerminalReasonToCallInAppNoticeEvent,
  noticeEventForCallTerminalClass,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";

/**
 * FACT A — iOS Native terminal contract:
 * NORMAL hangup → silent dismiss (notice=0), canonical UiHost finish once.
 * Voice .ending → render only.
 * markFailed(.ended) → NORMAL_ENDED (no red failure notice).
 * Web normal terminal → notice=0; genuine failure remains reachable.
 *
 * FACT B (Owner bottom/red/brief) remains OPEN / NOT_PROVEN — not covered here.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const videoUi = () => read("ios/App/App/Call/Video/NativeVideoCallUiHost.swift");
const videoRuntime = () => read("ios/App/App/Call/Video/NativeVideoCallRuntime.swift");
const videoCoord = () => read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");
const voiceUi = () => read("ios/App/App/Call/NativeVoiceCallUiHost.swift");
const nativeNotice = () => read("ios/App/App/Call/NativeCallInAppNotice.swift");

describe("iOS native terminal silent dismiss contract (FACT A)", () => {
  it("1/2 VIDEO local+remote normal end: notice=0 path + single canonical finish owner", () => {
    const ui = videoUi();
    const rt = videoRuntime();
    const coord = videoCoord();
    const notice = nativeNotice();

    // Canonical dismiss from snapshot terminal class (not raw "ended"→remoteEnded present).
    expect(ui).toContain("finishIfActive(callId: callId, terminalClass: .normalEnded)");
    expect(ui).toContain("noticeEvent(for: terminalClass)");
    expect(notice).toContain("case normalEnded");
    expect(notice).toMatch(/case \.normalEnded,\s*\.none:\s*return nil/);

    // Runtime no longer owns dismiss.
    expect(rt).not.toMatch(/NativeVideoCallUiHost\.finishIfActive/);
    // cleanup is not a dismiss owner.
    expect(coord).not.toMatch(/NativeVideoCallUiHost\.finishIfActive/);
    expect(coord).toContain("Canonical dismiss owner = Runtime terminal snapshot");

    // Typed failure on snapshot (no .failed → \"failed\" collapse).
    expect(ui).toContain("classifyVideoFailure");
    expect(rt).toContain("lastFailure");
    expect(rt).toContain("failure: lastFailure");
  });

  it("3/4 VOICE local+remote normal end: notice=0 + finish on .ended not raw remoteEnded present", () => {
    const ui = voiceUi();
    const notice = nativeNotice();
    expect(ui).toContain("finishIfActive(callId: callId, terminalClass: .normalEnded)");
    expect(ui).toContain("noticeEvent(for: terminalClass)");
    expect(notice).toMatch(/case \.normalEnded,\s*\.none:\s*return nil/);
  });

  it("5 VOICE .ending: dismiss=0 notice=0 (render only)", () => {
    const ui = voiceUi();
    const endingBlock = ui.slice(ui.indexOf("case .ending:"), ui.indexOf("case .rejecting:"));
    expect(endingBlock).toContain("render-only");
    expect(endingBlock).toContain("renderState");
    expect(endingBlock).not.toContain("finishIfActive");
    expect(endingBlock).not.toContain("presentCallInAppNoticeThenDismiss");
  });

  it("6 GENUINE FAILURE: failure notice reachable via actionableFailure → callFailed", () => {
    const notice = nativeNotice();
    expect(notice).toContain("case actionableFailure");
    expect(notice).toContain("return .callFailed");
    expect(noticeEventForCallTerminalClass("ACTIONABLE_FAILURE")).toBe("call_failed");
    expect(mapTerminalReasonToCallInAppNoticeEvent("failed")).toBe("call_failed");
    expect(mapTerminalReasonToCallInAppNoticeEvent("join_failed")).toBe("call_failed");
  });

  it("7 markFailed(.ended) → NORMAL_ENDED → red failure notice = 0", () => {
    const notice = nativeNotice();
    expect(notice).toContain("classifyVideoFailure");
    expect(notice).toMatch(/case \.ended:\s*return \.normalEnded/);
    expect(classifyCallTerminalReason("ended")).toBe("NORMAL_ENDED");
    expect(noticeEventForCallTerminalClass("NORMAL_ENDED")).toBeNull();
    expect(mapTerminalReasonToCallInAppNoticeEvent("ended")).toBeNull();
  });

  it("8 duplicate terminal: per-callId latch blocks second effective dismiss", () => {
    const video = videoUi();
    const voice = voiceUi();
    expect(video).toContain("terminalDismissCallId");
    expect(video).toContain("finish_if_active_duplicate_latched");
    expect(voice).toContain("terminalDismissCallId");
    expect(voice).toContain("ios_native_voice_finish_duplicate_latched");
  });

  it("9 stale previous call terminal cannot dismiss current call UI", () => {
    const video = videoUi();
    // Latch claim only after activeController.boundCallId == sid.
    expect(video).toContain("let matches = active?.boundCallId == sid");
    expect(video).toContain("Claim latch only when this call's VC is the dismiss target");
    expect(video).toContain("Do not latch (stale id)");
  });

  it("10 WEB NORMAL TERMINAL: notice = 0", () => {
    for (const raw of [
      "ended",
      "remote_ended",
      "call_ended",
      "end",
      "local_ended",
      "remote_terminal",
    ]) {
      expect(classifyCallTerminalReason(raw)).toBe("NORMAL_ENDED");
      expect(mapTerminalReasonToCallInAppNoticeEvent(raw)).toBeNull();
    }
  });

  it("11 WEB GENUINE FAILURE: notice remains reachable", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("failed")).toBe("call_failed");
    expect(mapTerminalReasonToCallInAppNoticeEvent("agora_join_error")).toBe("call_failed");
    expect(mapTerminalReasonToCallInAppNoticeEvent("rejected")).toBe("peer_declined");
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("permission_denied")).toBe("permission_required");
  });

  it("classification SSOT: writers consume class→event (no shadow map of ended→remote_ended present)", () => {
    const notice = nativeNotice();
    expect(notice).toContain("CallTerminalClass");
    expect(notice).toContain("classifyTerminalReason");
    expect(notice).toContain("noticeEvent(for terminalClass");
    // remoteEnded event may still exist for message/color tables, but normalEnded must not present it.
    expect(noticeEventForCallTerminalClass("NORMAL_ENDED")).toBeNull();
  });

  it("cleanup orphan path closed: end_idle publishes terminal before cleanup; cleanup has no finishIfActive", () => {
    const coord = videoCoord();
    const endIdle = coord.slice(coord.indexOf("default:"), coord.indexOf("func handleRemoteTerminal"));
    expect(endIdle).toContain("markEnded(sessionId: sid)");
    expect(endIdle).toContain("markFailed(sessionId: sid, reason: .ended)");
    expect(coord).not.toMatch(/NativeVideoCallUiHost\.finishIfActive/);
  });
});
