/**
 * 영어 화면 통화 기록 한국어 표시 — docs/audit/call-record-en-korean-residual-design-2026-11-13.md
 * D2: 2026-10-15 토큰 도입 전 방 미리보기(한국어 문장 14형태, 운영 DB 102행) → 한국어 화면 원문 그대로, 영어 화면 영어.
 * D1: 대화방 통화 말풍선 둘째 줄(발신·수신)은 카탈로그 키.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCallStubRoomTipForViewer,
  formatLegacyCallStubLabelForLang,
  parseLegacyCallStubLabel,
  resolveRoomLastMessageForViewer,
} from "@/lib/community-messenger/call-stub-room-tip";

/** 운영 DB 14형태(숫자는 예시 값) → 영어 화면 기대값 */
const LEGACY_EN: ReadonlyArray<readonly [string, string]> = [
  ["영상 통화 · 취소됨", "Video call · Cancelled"],
  ["음성 통화 · 취소됨", "Voice call · Cancelled"],
  ["영상 통화 · 통화 종료", "Video call · Call ended"],
  ["영상 통화 · 3m 51s", "Video call · 3m 51s"],
  ["영상 통화 · 12s", "Video call · 12s"],
  ["음성 통화 · 통화 종료", "Voice call · Call ended"],
  ["음성 통화 · 거절됨", "Voice call · Declined"],
  ["영상 통화 · 부재중", "Missed video call"],
  ["부재중 음성 통화", "Missed voice call"],
  ["음성 통화 · 부재중", "Missed voice call"],
  ["음성 통화 · 발신 중", "Voice call · Calling…"],
  ["영상 통화 · cancelled", "Video call · Cancelled"],
  ["영상 통화 · 연결 끊김", "Video call · Interrupted"],
  ["영상 통화 · 45초", "Video call · 45s"],
];

describe("D2 옛 통화 문장 — 정확 일치 표", () => {
  it.each(LEGACY_EN)("영어 화면: %s → %s (목록 공용 함수·통화 tip 함수 둘 다)", (ko, en) => {
    expect(resolveRoomLastMessageForViewer(ko, null, "en")).toBe(en);
    expect(resolveRoomLastMessageForViewer(ko, "viewer-1", "en")).toBe(en);
    expect(formatCallStubRoomTipForViewer(ko, null, "en")).toBe(en);
  });

  it.each(LEGACY_EN)("한국어 화면은 원문 그대로: %s", (ko) => {
    expect(formatLegacyCallStubLabelForLang(ko, "ko")).toBeNull();
    expect(resolveRoomLastMessageForViewer(ko, null, "ko")).toBe(ko);
    expect(formatCallStubRoomTipForViewer(ko, "viewer-1", "ko")).toBe(ko);
  });

  it("표에 없는 문장·일반 글은 원문 그대로 (부분 일치로 바꾸지 않음)", () => {
    for (const text of [
      "음성 통화 · 안녕",
      "음성 통화 · 0s",
      "영상 통화 하자",
      "오늘 영상 통화 · 취소됨 이었어",
      "부재중 음성 통화 왔네",
      "Voice call · Cancelled",
      "",
    ]) {
      expect(parseLegacyCallStubLabel(text), text).toBeNull();
      expect(resolveRoomLastMessageForViewer(text, null, "en"), text).toBe(text);
    }
  });

  it("시간: 분·초 형태 모두 같은 초로 해석", () => {
    expect(parseLegacyCallStubLabel("영상 통화 · 3m 51s")).toEqual({ callKind: "video", canonical: "connected_ended", durationSeconds: 231 });
    expect(parseLegacyCallStubLabel("영상 통화 · 3분 51초")).toEqual({ callKind: "video", canonical: "connected_ended", durationSeconds: 231 });
  });
});

describe("D1 통화 말풍선 발신·수신 = 카탈로그 키", () => {
  it("코드 속 한국어 「발신」「수신」 없음, 키 사용", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../../components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/["']발신["']|["']수신["']/);
    expect(src).toContain('t(isMine ? "cm_call_direction_outgoing" : "cm_call_direction_incoming")');
  });
});
