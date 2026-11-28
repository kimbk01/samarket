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

/**
 * 점검 H1 (2026-11-28): 어드민이 문의 A 를 보다 B 를 누르면 —
 *  - 화면은 즉시 「불러오는 중」(A 상세를 B 처럼 보이지 않는다)
 *  - 늦게 온 A 응답·같은 문의의 옛 응답은 버린다
 *  - 답변·종료·담당·우선순위·수정·삭제는 「누를 때 보이던 문의」가 지금도 열린 문의일 때만 그 id 로 보낸다
 */
export type AdminSupportLoadedDetail<C extends { id: string } = { id: string; last_message_at?: string | null }, M = unknown> = {
  caseId: string;
  case: C;
  messages: M[];
  followupIssues: Record<string, string>;
};

/** 지금 열린 문의(`activeId`)의 상세만 돌려준다 — 다른 문의 상세면 null(= 불러오는 중) */
export function pickAdminSupportShownDetail<D extends { caseId: string; case: { id: string } }>(
  detail: D | null,
  activeId: string | null
): D | null {
  if (!detail || !activeId) return null;
  return detail.caseId === activeId && detail.case.id === activeId ? detail : null;
}

/** 상세 응답을 화면에 반영해도 되는가 — 가장 최근 요청이고, 그 요청의 문의가 지금 열린 문의일 때만 */
export function isAdminSupportDetailResponseCurrent(input: {
  requestSeq: number;
  latestSeq: number;
  requestCaseId: string;
  activeId: string | null;
}): boolean {
  return input.requestSeq === input.latestSeq && Boolean(input.activeId) && input.requestCaseId === input.activeId;
}

/** 저장 대상 문의 id — 누를 때 보이던 문의 = 지금 열린 문의 = 지금 보이는 상세 일 때만, 아니면 null(보내지 않음) */
export function resolveAdminSupportWriteTarget(input: {
  expectedCaseId: string | null | undefined;
  activeId: string | null;
  shownCaseId: string | null;
}): string | null {
  const id = String(input.expectedCaseId ?? "").trim();
  if (!id) return null;
  return input.activeId === id && input.shownCaseId === id ? id : null;
}
