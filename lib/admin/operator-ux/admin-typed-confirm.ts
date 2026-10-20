/**
 * 실지급·소멸 같은 되돌리기 어려운 Admin 실행의 「다시 입력해 확인」 판정 (AdminActionConfirmDialog 공용).
 * 공백·천 단위 쉼표는 무시한다 (예: "1,200" == "1200", "철수 500" == "철수500"). 대소문자는 구분하지 않는다.
 * (클라이언트 안전 — 서버 전용 모듈 import 금지)
 */

export function normalizeAdminTypedConfirm(value: string): string {
  return String(value ?? "")
    .replace(/[\s,]/g, "")
    .toLowerCase();
}

/** expected 가 비어 있으면 확인 대상이 없는 것으로 보고 통과시키지 않는다(잘못된 설정 방지). */
export function isAdminTypedConfirmMatch(input: string, expected: string): boolean {
  const want = normalizeAdminTypedConfirm(expected);
  if (!want) return false;
  return normalizeAdminTypedConfirm(input) === want;
}

export function canConfirmAdminAction(opts: {
  reasonRequired: boolean;
  reason: string;
  reasonMinLength?: number;
  confirmMatchText?: string | null;
  typed: string;
}): boolean {
  const min = Math.max(1, Math.trunc(opts.reasonMinLength ?? 1));
  if (opts.reasonRequired && opts.reason.trim().length < min) return false;
  if (opts.confirmMatchText != null && !isAdminTypedConfirmMatch(opts.typed, opts.confirmMatchText)) {
    return false;
  }
  return true;
}
