import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 채팅 시안 4판 (Owner 「정확히 시안대로」 2026-11-10) — 대화 목록 오른쪽 위 시각, 카카오톡 형식.
 * - 오늘: 「오전 9:54」·「오후 2:50」 (en "9:54 AM")
 * - 어제: 「어제」 (en "Yesterday")
 * - 올해: 「11월 5일」 (en "Nov 5")
 * - 그 전: 「2025. 3. 2.」 (en "3/2/2025")
 * 기기 현지 시각 기준. 글자는 모두 카탈로그 키(`cm_ui_chat_list_*`·`cm_ui_month_short_*`).
 */
export type ChatListTimeTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const MONTH_SHORT_KEYS: readonly MessageKey[] = [
  "cm_ui_month_short_1",
  "cm_ui_month_short_2",
  "cm_ui_month_short_3",
  "cm_ui_month_short_4",
  "cm_ui_month_short_5",
  "cm_ui_month_short_6",
  "cm_ui_month_short_7",
  "cm_ui_month_short_8",
  "cm_ui_month_short_9",
  "cm_ui_month_short_10",
  "cm_ui_month_short_11",
  "cm_ui_month_short_12",
];

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatChatListKakaoTime(
  value: string | null | undefined,
  tr: ChatListTimeTranslate,
  now: Date = new Date()
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";

  if (sameLocalDate(date, now)) {
    const hours = date.getHours();
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const time = `${hour12}:${String(date.getMinutes()).padStart(2, "0")}`;
    return tr(hours < 12 ? "cm_ui_chat_list_time_am" : "cm_ui_chat_list_time_pm", { time });
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDate(date, yesterday)) {
    return tr("cm_ui_call_log_time_yesterday");
  }

  if (date.getFullYear() === now.getFullYear()) {
    return tr("cm_ui_chat_list_month_day", {
      month: tr(MONTH_SHORT_KEYS[date.getMonth()]!),
      day: date.getDate(),
    });
  }

  return tr("cm_ui_chat_list_full_date", {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

function formatClock(date: Date, tr: ChatListTimeTranslate): string {
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const time = `${hour12}:${String(date.getMinutes()).padStart(2, "0")}`;
  return tr(hours < 12 ? "cm_ui_chat_list_time_am" : "cm_ui_chat_list_time_pm", { time });
}

/**
 * 날짜 + 시각 (통화 탭 두 번째 줄, 채팅 시안 4판 「3. 통화 탭」).
 * - 오늘: 「오전 9:54」 · 어제: 「어제 오전 2:50」 · 올해: 「11월 8일 오후 9:29」 · 그 전: 「2025. 3. 2. 오후 9:29」
 * 날짜 부분은 위 `formatChatListKakaoTime` 과 같은 규칙·키.
 */
export function formatChatListKakaoDateTime(
  value: string | null | undefined,
  tr: ChatListTimeTranslate,
  now: Date = new Date()
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  const clock = formatClock(date, tr);
  if (sameLocalDate(date, now)) return clock;
  return tr("cm_ui_chat_list_date_time", { date: formatChatListKakaoTime(raw, tr, now), time: clock });
}
