/**
 * 관리자 고객지원 관제 — 오른쪽 상세 영역 표시 단계.
 * 항목을 누른 직후 첫 렌더에서는 `activeId` 만 바뀌고 상세 요청(`detailLoading`)이 아직 시작되지 않았다.
 * 이때 오류 값이 없는데 「오류」 분기로 들어가 기본 문구 「오류가 발생했습니다.」가 잠깐 보였다.
 * 오류는 실제 오류 값이 있을 때만 표시하고, 상세가 아직 없으면 불러오는 중으로 본다.
 */
export type AdminSupportDetailPane = "empty" | "loading" | "error" | "detail";

export function resolveAdminSupportDetailPane(input: {
  activeId: string | null;
  detailLoading: boolean;
  hasActiveCase: boolean;
  error: string | null;
}): AdminSupportDetailPane {
  if (!input.activeId) return "empty";
  if (input.hasActiveCase) return "detail";
  if (input.detailLoading || !input.error) return "loading";
  return "error";
}
