/**
 * `stores.applicant_nickname` — 매장 신청 시 필수 수집값 (O-01 / DB-3).
 * 운영 DB 는 마이그레이션 20270708140100 으로 컬럼을 실제 적용한다. 컬럼 부재는 더 이상 조용히 넘기지 않고
 * 매장 신청 POST 가 503 `applicant_nickname_save_failed` 로 실패를 알리는 데 쓴다.
 */
export const STORES_APPLICANT_NICKNAME_SAVE_FAILED_ERROR = "applicant_nickname_save_failed";

export function isMissingStoresApplicantNicknameColumnError(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.includes("applicant_nickname")) return false;
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("column") ||
    m.includes("could not find")
  );
}
