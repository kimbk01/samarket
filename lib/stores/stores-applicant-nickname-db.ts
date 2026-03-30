/**
 * `stores.applicant_nickname` 컬럼은 마이그레이션 선택 사항.
 * 미적용 DB에서는 select/insert 시 오류가 나므로 감지·재시도에 사용합니다.
 */
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
