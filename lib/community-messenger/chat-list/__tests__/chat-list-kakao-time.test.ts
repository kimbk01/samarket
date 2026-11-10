import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { formatChatListKakaoDateTime, formatChatListKakaoTime } from "@/lib/community-messenger/chat-list/chat-list-kakao-time";

/** 채팅 시안 4판 — 대화 목록 시각 (카카오톡 형식). 기기 현지 시각 기준이라 Date 는 현지 생성자로 만든다. */
const ko = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const now = new Date(2026, 10, 10, 15, 0);
const iso = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe("formatChatListKakaoTime", () => {
  it("today → 오전/오후 h:mm", () => {
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 9, 54), ko, now)).toBe("오전 9:54");
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 14, 50), ko, now)).toBe("오후 2:50");
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 0, 5), ko, now)).toBe("오전 12:05");
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 12, 0), ko, now)).toBe("오후 12:00");
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 9, 54), en, now)).toBe("9:54 AM");
    expect(formatChatListKakaoTime(iso(2026, 10, 10, 14, 50), en, now)).toBe("2:50 PM");
  });

  it("yesterday → 어제 (also across a month boundary)", () => {
    expect(formatChatListKakaoTime(iso(2026, 10, 9, 23, 59), ko, now)).toBe("어제");
    expect(formatChatListKakaoTime(iso(2026, 10, 9, 0, 1), en, now)).toBe("Yesterday");
    expect(formatChatListKakaoTime(iso(2026, 9, 31, 8, 0), ko, new Date(2026, 10, 1, 7, 0))).toBe("어제");
  });

  it("this year → 11월 5일 / Nov 5", () => {
    expect(formatChatListKakaoTime(iso(2026, 10, 5, 8, 0), ko, now)).toBe("11월 5일");
    expect(formatChatListKakaoTime(iso(2026, 10, 5, 8, 0), en, now)).toBe("Nov 5");
    expect(formatChatListKakaoTime(iso(2026, 0, 1, 8, 0), ko, now)).toBe("1월 1일");
  });

  it("older years → 2025. 3. 2. / 3/2/2025", () => {
    expect(formatChatListKakaoTime(iso(2025, 2, 2, 8, 0), ko, now)).toBe("2025. 3. 2.");
    expect(formatChatListKakaoTime(iso(2025, 2, 2, 8, 0), en, now)).toBe("3/2/2025");
  });

  it("empty or invalid → empty string", () => {
    expect(formatChatListKakaoTime("", ko, now)).toBe("");
    expect(formatChatListKakaoTime(null, ko, now)).toBe("");
    expect(formatChatListKakaoTime("not-a-date", ko, now)).toBe("");
  });
});

describe("formatChatListKakaoDateTime (통화 탭 날짜+시각)", () => {
  it("오늘은 시각만, 어제·올해·지난해는 날짜 + 시각", () => {
    expect(formatChatListKakaoDateTime(iso(2026, 10, 10, 9, 54), ko, now)).toBe("오전 9:54");
    expect(formatChatListKakaoDateTime(iso(2026, 10, 9, 2, 50), ko, now)).toBe("어제 오전 2:50");
    expect(formatChatListKakaoDateTime(iso(2026, 10, 8, 21, 29), ko, now)).toBe("11월 8일 오후 9:29");
    expect(formatChatListKakaoDateTime(iso(2025, 2, 2, 21, 29), ko, now)).toBe("2025. 3. 2. 오후 9:29");
    expect(formatChatListKakaoDateTime(iso(2026, 10, 9, 2, 50), en, now)).toBe("Yesterday, 2:50 AM");
    expect(formatChatListKakaoDateTime(iso(2026, 10, 8, 21, 29), en, now)).toBe("Nov 8, 9:29 PM");
    expect(formatChatListKakaoDateTime("", ko, now)).toBe("");
  });
});
