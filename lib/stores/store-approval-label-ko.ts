/** DB `stores.approval_status` → 사용자 표시 (어드민 시트와 동일 계열) */
export const STORE_APPROVAL_STATUS_LABEL_KO: Record<string, string> = {
  pending: "신청대기",
  under_review: "검토중",
  revision_requested: "보완요청",
  approved: "승인됨",
  rejected: "반려",
  suspended: "정지",
};

export function formatStoreApprovalStatusKo(status: string | null | undefined): string {
  const s = String(status ?? "").trim();
  if (!s) return "상태 미정";
  return STORE_APPROVAL_STATUS_LABEL_KO[s] ?? s;
}

/** `/stores` 둘러보기·피드에 나오는 조건과 동일 계열 */
export function isStorePubliclyListed(row: {
  approval_status?: string | null;
  is_visible?: boolean | null;
  slug?: string | null;
}): boolean {
  return (
    String(row.approval_status) === "approved" &&
    row.is_visible === true &&
    Boolean(String(row.slug ?? "").trim())
  );
}
