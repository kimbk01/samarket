import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  formatChatListKakaoDateTime,
  formatChatListKakaoTime,
  formatClock,
} from "@/lib/community-messenger/chat-list/chat-list-kakao-time";
import { formatMessengerCalendarDate } from "@/lib/community-messenger/messenger-clock-time";
import {
  formatMessengerLastSeenLine,
  formatMessengerPeerPresenceLine,
} from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";

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

/** P4-B (Owner 2026-11-18 「권장안대로 반영」 · 레거시 Telegram): 메신저 시각·날짜 구분선·마지막 접속 */
describe("P4-B 메신저 시각 1형식", () => {
  it("formatClock — ko 「오전 2:16」 / en 「2:16 AM」, 자정·정오", () => {
    expect(formatClock(new Date(2026, 10, 18, 2, 16), ko)).toBe("오전 2:16");
    expect(formatClock(new Date(2026, 10, 18, 2, 16), en)).toBe("2:16 AM");
    expect(formatClock(new Date(2026, 10, 18, 0, 5), ko)).toBe("오전 12:05");
    expect(formatClock(new Date(2026, 10, 18, 12, 0), en)).toBe("12:00 PM");
    expect(formatClock(new Date(2026, 10, 18, 23, 57), ko)).toBe("오후 11:57");
  });

  it("날짜 구분선 — 올해 연도 생략, 다른 해 연도 (언어 따름)", () => {
    const n = new Date(2026, 10, 18, 9, 0);
    expect(formatMessengerCalendarDate(new Date(2026, 10, 12, 8, 0), ko, "long", n)).toBe("11월 12일");
    expect(formatMessengerCalendarDate(new Date(2026, 10, 12, 8, 0), en, "long", n)).toBe("November 12");
    expect(formatMessengerCalendarDate(new Date(2025, 10, 12, 8, 0), ko, "long", n)).toBe("2025년 11월 12일");
    expect(formatMessengerCalendarDate(new Date(2025, 10, 12, 8, 0), en, "long", n)).toBe("November 12, 2025");
    expect(formatMessengerCalendarDate(new Date(2026, 10, 15, 8, 0), en, "short", n)).toBe("Nov 15");
  });

  it("마지막 접속 — 오늘·어제·올해·다른 해", () => {
    const n = new Date(2026, 10, 18, 9, 0);
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 18, 1, 48), ko, n)).toBe("오전 1:48까지 접속함");
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 18, 1, 48), en, n)).toBe("last seen today at 1:48 AM");
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 17, 23, 57), ko, n)).toBe("어제 오후 11:57까지 접속함");
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 17, 23, 57), en, n)).toBe("last seen yesterday at 11:57 PM");
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 15, 23, 57), ko, n)).toBe("11월 15일 오후 11:57까지 접속함");
    expect(formatMessengerLastSeenLine(new Date(2026, 10, 15, 23, 57), en, n)).toBe("last seen Nov 15 at 11:57 PM");
    expect(formatMessengerLastSeenLine(new Date(2025, 10, 15, 23, 57), ko, n)).toBe("2025년 11월 15일 오후 11:57까지 접속함");
    expect(formatMessengerLastSeenLine(new Date(2025, 10, 15, 23, 57), en, n)).toBe("last seen Nov 15, 2025 at 11:57 PM");
  });

  it("접속 줄 — 온라인·잘못된 시각은 오프라인", () => {
    const n = new Date(2026, 10, 18, 9, 0);
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "online", lastSeenAt: null }, ko, n)).toBe("온라인");
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "offline", lastSeenAt: "nope" }, en, n)).toBe("Offline");
    expect(
      formatMessengerPeerPresenceLine({ userId: "u", state: "offline", lastSeenAt: iso(2026, 10, 18, 1, 48) }, ko, n)
    ).toBe("오전 1:48까지 접속함");
  });
});
