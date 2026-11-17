import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { formatClock, type ChatListTimeTranslate } from "@/lib/community-messenger/chat-list/chat-list-kakao-time";

/**
 * 메신저 시계 시각 SSOT — 방 말풍선·사진 위·방 통화 줄·방 시트·통화 상세 행.
 * 지속시간(duration)과 혼동 금지.
 *
 * P4-B (Owner 2026-11-18 「권장안대로 반영」, 레거시 Telegram 기준): 화면 언어를 따른다 —
 * ko 「오전 2:16」 / en 「2:16 AM」. 대화 목록·통화 탭과 같은 함수(`chat-list-kakao-time.ts` `formatClock`).
 * 언어 = 호출처가 넘기는 화면 언어(`useI18n().language`). 예전 「en-US 고정」 규칙은 폐기.
 *
 * 채팅 P0-1 (Owner 「채팅 P0 승인」 2026-11-11): 호출마다 포맷터 생성 금지 — 이제 `Intl` 을 아예 만들지 않는다.
 * 기기 24시간 설정은 웹에서 읽을 수 없어 12시간 고정(`formatClock` 주석).
 */
export function formatMessengerClock(date: Date, lang: AppLanguageCode): string {
  return formatClock(date, messengerTranslatorFor(lang));
}

/** `lang` 은 필수 — 호출처가 화면 언어(`useI18n().language`)를 넘긴다(전역 기본값 의존 금지: SSR·언어 전환 순간 혼재 방지). */
export function formatMessengerClockTime(iso: string, lang: AppLanguageCode): string {
  const raw = iso.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return formatMessengerClock(date, lang);
}

const MONTH_LONG_KEYS: readonly MessageKey[] = [
  "cm_ui_month_long_1",
  "cm_ui_month_long_2",
  "cm_ui_month_long_3",
  "cm_ui_month_long_4",
  "cm_ui_month_long_5",
  "cm_ui_month_long_6",
  "cm_ui_month_long_7",
  "cm_ui_month_long_8",
  "cm_ui_month_long_9",
  "cm_ui_month_long_10",
  "cm_ui_month_long_11",
  "cm_ui_month_long_12",
];

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

/**
 * 날짜(월·일, 다른 해만 연도) — 레거시 `chatDate`(MMMM d)·`chatFullDate`(다른 해) 규칙.
 * - `long`: 날짜 구분선 — ko 「11월 12일」·「2025년 11월 12일」 / en 「November 12」·「November 12, 2025」
 * - `short`: 마지막 접속 — ko 같음 / en 「Nov 15」·「Nov 15, 2025」
 * `Intl` 없음(카탈로그 키).
 */
export function formatMessengerCalendarDate(
  date: Date,
  tr: ChatListTimeTranslate,
  monthStyle: "long" | "short",
  now: Date = new Date()
): string {
  const month = tr((monthStyle === "long" ? MONTH_LONG_KEYS : MONTH_SHORT_KEYS)[date.getMonth()]!);
  const day = date.getDate();
  if (date.getFullYear() === now.getFullYear()) {
    return tr("cm_ui_chat_list_month_day", { month, day });
  }
  return tr("cm_ui_date_month_day_year", { year: date.getFullYear(), month, day });
}

/** 언어 코드 → 카탈로그 조회 함수 (React 밖·모듈 캐시용) */
const translators = new Map<AppLanguageCode, ChatListTimeTranslate>();

export function messengerTranslatorFor(lang: AppLanguageCode): ChatListTimeTranslate {
  let tr = translators.get(lang);
  if (!tr) {
    tr = (key, vars) => translate(lang, key, vars);
    translators.set(lang, tr);
  }
  return tr;
}
