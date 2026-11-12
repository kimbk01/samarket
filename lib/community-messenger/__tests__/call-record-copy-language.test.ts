/**
 * 언어 SSOT 6번 (Owner 「계획대로 승인」 2026-11-08) — 통화 기록 문구.
 * 1) 한국어 결과 = 변경 전 함수 결과(4,032개 스냅숏)와 한 글자도 다르지 않다.
 *    갱신 2026-11-13(Owner 「발신자 취소 → 수신자 부재중」): 바뀐 48개 = 발신자 취소 × 보는 사람이 발신자가 아님(수신자 36 · 그 밖 12)뿐.
 * 2) 영어 화면은 영어. 3) DB 저장 문장은 화면 언어와 무관하게 한국어(시간 글자 포함).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  buildCallEventPresentation,
  formatCallEventForViewer,
  formatCallEventSharedListLabel,
} from "@/lib/community-messenger/call-event-presentation";
import { getCallStubTimelineSecondLine, getCallStubTimelineStatusLine } from "@/lib/community-messenger/call-event-message";
import { formatCallStubRoomTipForViewer } from "@/lib/community-messenger/call-stub-room-tip";

const SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/call-record-copy-ko-snapshot.json"), "utf8")
) as Record<string, unknown>;

const CANON = ["outgoing_started", "incoming_received", "connected_ended", "outgoing_cancelled", "incoming_missed", "remote_rejected", "local_rejected", "remote_busy", "self_busy", "failed", "unanswered", "interrupted"] as const;
const EVENTS = [null, "outgoing_started", "incoming_received", "cancelled_by_caller", "rejected_by_callee", "missed", "ended", "failed", "disconnected", "peer_busy", "caller_busy"] as const;
const STATUSES = ["dialing", "incoming", "missed", "cancelled", "rejected", "ended"] as const;
const KINDS = ["voice", "video"] as const;
const DURS = [0, 45, 231];
const ROLES = ["caller", "callee", null] as const;

afterEach(() => setRuntimeAppLanguage("en"));

describe("한국어 글자 = 변경 전과 동일 (전수)", () => {
  it("4,032개 조합", () => {
    /** 화면 언어 전역값을 영어로 둬도 `lang: "ko"` 결과가 같아야 한다(서버 조건) */
    setRuntimeAppLanguage("en");
    const actual: Record<string, unknown> = {};
    for (const k of KINDS) for (const c of CANON) for (const d of DURS) {
      const p = buildCallEventPresentation({ callKind: k, canonical: c, durationSeconds: d, lang: "ko" });
      actual[`present|${k}|${c}|${d}`] = [p.kindLabel, p.resultLabel, p.fullLabel, p.listPreview, p.isMissed, p.isTerminal];
    }
    for (const k of KINDS) for (const e of EVENTS) for (const s of STATUSES) for (const d of DURS) {
      actual[`shared|${k}|${e}|${s}|${d}`] = formatCallEventSharedListLabel(k, s, d, e);
      for (const r of ROLES) {
        const p = formatCallEventForViewer({ callKind: k, resolvedEvent: e, callStatusFallback: s, viewerRole: r, durationSeconds: d, lang: "ko" });
        actual[`viewer|${k}|${e}|${s}|${d}|${r}`] = [p.fullLabel, p.resultLabel, p.listPreview];
      }
      for (const v of ["A", "B", "X"]) {
        const args = { callKind: k, resolvedEvent: e, callStatusFallback: s, viewerUserId: v, senderUserId: "A", initiatorUserId: "A", recipientUserId: "B", durationSeconds: d, lang: "ko" } as const;
        actual[`timeline|${k}|${e}|${s}|${d}|${v}`] = [getCallStubTimelineStatusLine(args), getCallStubTimelineSecondLine(args)];
        const token = ["cmcall1", k, s, e ?? "", "A", "B", String(d), "공유라벨"].join("|");
        actual[`tip|${k}|${e}|${s}|${d}|${v}`] = formatCallStubRoomTipForViewer(token, v, "ko");
      }
    }
    expect(Object.keys(actual).length).toBe(Object.keys(SNAPSHOT).length);
    expect(actual).toEqual(SNAPSHOT);
  });
});

describe("영어 화면", () => {
  it("목록·대화방 줄", () => {
    const cancel = buildCallEventPresentation({ callKind: "voice", canonical: "outgoing_cancelled", lang: "en" });
    expect(cancel.listPreview).toBe("Voice call · Cancelled");
    expect(cancel.resultLabel).toBe("Cancelled");
    expect(buildCallEventPresentation({ callKind: "video", canonical: "incoming_missed", lang: "en" }).listPreview).toBe("Missed video call");
    expect(buildCallEventPresentation({ callKind: "video", canonical: "connected_ended", durationSeconds: 231, lang: "en" }).listPreview).toBe("Video call · 3m 51s");
    expect(buildCallEventPresentation({ callKind: "voice", canonical: "remote_rejected", lang: "en" }).listPreview).toBe("Voice call · Declined");
    expect(buildCallEventPresentation({ callKind: "voice", canonical: "outgoing_started", lang: "en" }).listPreview).toBe("Voice call · Calling…");
  });
  it("토큰 — 보는 사람을 알 때·모를 때 모두 영어", () => {
    const token = "cmcall1|voice|cancelled|cancelled_by_caller|A|B|0|음성 통화 · 취소";
    // 수신자(B)는 발신자 취소를 부재중으로 (Owner 2026-11-13)
    expect(formatCallStubRoomTipForViewer(token, "B", "en")).toBe("Missed voice call");
    expect(formatCallStubRoomTipForViewer(token, "A", "en")).toBe("Voice call · Cancelled");
    expect(formatCallStubRoomTipForViewer(token, null, "en")).toBe("Voice call · Cancelled");
    expect(formatCallStubRoomTipForViewer(token, null, "ko")).toBe("음성 통화 · 취소");
  });
});

describe("DB 저장 문장 = 한국어 고정 (C3)", () => {
  it("화면 언어 전역값이 영어여도 시간 글자까지 한국어", () => {
    setRuntimeAppLanguage("en");
    expect(formatCallEventSharedListLabel("video", "ended", 231, "ended")).toBe("영상 통화 · 3분 51초");
    expect(formatCallEventSharedListLabel("voice", "ended", 8, "ended")).toBe("음성 통화 · 8초");
  });
});
