/**
 * 옛 고객센터 알림 저장 문장 → 보는 사람 언어 (언어 실기 후속 2026-11-27).
 *
 * 2026-10-28(e053417) 이전 `lib/support/support-case-service.ts` 는 알림 제목·본문을 한국어 문장·내부 코드로 저장했다:
 * - 제목 `문의 {번호}`(접수·답변) · `문의 {번호} 종료` · `문의 {번호} 재오픈`
 * - 본문 `상담이 종료되었습니다.` · `상담이 다시 열렸습니다.` · 접수 알림 = `{카테고리 코드} · {진입 화면 코드}`
 * DB 는 고치지 않고 화면에서 카탈로그(`support_notif_legacy_*`) 틀로 알아본 것만 다시 그린다. 그 밖의 글(관리자 답변 본문 등)은 null.
 * 지금 발송 행은 meta 의 `titleKey`·`messageKey` 로 그려지므로 여기까지 오지 않는다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createCatalogTemplateMatcher } from "@/lib/i18n/stored-text-template-match";
import { getSupportCategoryDefinition } from "@/lib/support/support-category-registry";

const TITLE_KEYS: readonly MessageKey[] = [
  "support_notif_legacy_case_title",
  "support_notif_legacy_case_closed_title",
  "support_notif_legacy_case_reopened_title",
];
const BODY_KEYS: readonly MessageKey[] = ["support_notif_legacy_closed_body", "support_notif_legacy_reopened_body"];

const matchTitle = createCatalogTemplateMatcher(TITLE_KEYS);
const matchBody = createCatalogTemplateMatcher(BODY_KEYS);

/** 문의 번호(`SC-100032`) — 사람이 쓴 「문의 …」 제목과 구분 */
const CASE_NO = /^SC-[0-9A-Za-z]+$/;
/** 옛 접수 알림 본문 `ACCOUNT · mypage_customer_center` (진입 화면 코드는 없을 수 있음) */
const CATEGORY_SURFACE = /^([A-Z][A-Z0-9_]*)(?: · [a-z0-9_]+)?$/;

/** 고객센터 알림이 아닌 종류(`event_type` 을 알 때)면 건드리지 않는다 */
function isOtherEventType(eventType: string | null | undefined): boolean {
  const t = String(eventType ?? "").trim();
  return Boolean(t) && !t.startsWith("support_");
}

export function mapLegacySupportNotificationTitle(
  lang: AppLanguageCode,
  text: string | null | undefined,
  eventType?: string | null
): string | null {
  if (isOtherEventType(eventType)) return null;
  const match = matchTitle(text);
  if (!match) return null;
  const caseNo = String(match.vars.caseNo ?? "").trim();
  if (!CASE_NO.test(caseNo)) return null;
  return translate(lang, match.key, { caseNo });
}

export function mapLegacySupportNotificationBody(
  lang: AppLanguageCode,
  text: string | null | undefined,
  eventType?: string | null
): string | null {
  if (isOtherEventType(eventType)) return null;
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const fixed = matchBody(raw);
  if (fixed) return translate(lang, fixed.key);
  const m = CATEGORY_SURFACE.exec(raw);
  if (!m) return null;
  const def = getSupportCategoryDefinition(m[1]!);
  if (!def) return null;
  return translate(lang, "support_notif_legacy_category_body", {
    category: translate(lang, def.labelKey as MessageKey),
  });
}
