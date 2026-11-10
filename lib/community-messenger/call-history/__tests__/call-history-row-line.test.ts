import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { formatCallHistoryRowLine } from "@/lib/community-messenger/call-history/call-history-row-line";

/** 채팅 시안 4판 「3. 통화 탭」 — 둘째 줄 「종류 · 결과(또는 통화 시간) · 날짜 시각」, 부재중만 「부재중 종류 · 시각」 빨강 */
const ko = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const now = new Date(2026, 10, 10, 15, 0);
const iso = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe("formatCallHistoryRowLine", () => {
  it("취소·거절 = 결과 글자, 연결 통화 = 통화 시간", () => {
    expect(
      formatCallHistoryRowLine(
        {
          callKind: "voice",
          displayType: "cancelled",
          badgeLabelKey: "cm_call_status_cancelled",
          durationLabel: null,
          timeIso: iso(2026, 10, 9, 2, 50),
        },
        ko,
        now
      )
    ).toEqual({ text: "음성 · 취소 · 어제 오전 2:50", missed: false });
    expect(
      formatCallHistoryRowLine(
        {
          callKind: "voice",
          displayType: "rejected",
          badgeLabelKey: "cm_call_status_rejected_by_peer",
          durationLabel: null,
          timeIso: iso(2026, 10, 8, 21, 28),
        },
        ko,
        now
      ).text
    ).toBe("음성 · 거절 · 11월 8일 오후 9:28");
    expect(
      formatCallHistoryRowLine(
        {
          callKind: "video",
          displayType: "outgoing",
          badgeLabelKey: "cm_call_status_outgoing_answered",
          durationLabel: "6분 56초",
          timeIso: iso(2026, 10, 10, 9, 54),
        },
        ko,
        now
      ).text
    ).toBe("영상 · 6분 56초 · 오전 9:54");
  });

  it("놓친 수신 = 「부재중 음성 · 시각」 + 빨강", () => {
    expect(
      formatCallHistoryRowLine(
        {
          callKind: "voice",
          displayType: "missed_incoming",
          badgeLabelKey: "cm_call_status_missed",
          durationLabel: null,
          timeIso: iso(2026, 10, 8, 21, 29),
        },
        ko,
        now
      )
    ).toEqual({ text: "부재중 음성 · 11월 8일 오후 9:29", missed: true });
    expect(
      formatCallHistoryRowLine(
        {
          callKind: "video",
          displayType: "missed_incoming",
          badgeLabelKey: "cm_call_status_missed",
          durationLabel: null,
          timeIso: iso(2026, 10, 10, 9, 0),
        },
        en,
        now
      ).text
    ).toBe("Missed video · 9:00 AM");
  });

  it("시각이 없으면 앞 두 칸만", () => {
    expect(
      formatCallHistoryRowLine(
        { callKind: "voice", displayType: "busy", badgeLabelKey: "cm_call_status_busy_peer", durationLabel: null, timeIso: "" },
        ko,
        now
      ).text
    ).toBe("음성 · 통화 중");
  });

  it("통화 줄: 상태 칩·오른쪽 시각 없음, 다시 걸기는 모든 줄 (못 걸면 흐림)", () => {
    const row = readFileSync(
      join(process.cwd(), "components/community-messenger/call-history/CommunityMessengerCallRow.tsx"),
      "utf8"
    );
    expect(row).not.toContain("CommunityMessengerCallDirectionBadge");
    expect(row).not.toContain("data-cm-call-occurrence-time");
    expect(row).toContain("formatCallHistoryRowLine(");
    expect(row).toContain("disabled={globalRedialBlocked || !vm.canRedial}");
    expect(row).not.toContain("vm.canRedial ? (");
  });
});
