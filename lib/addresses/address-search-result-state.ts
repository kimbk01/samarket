/** 주소 검색 결과 영역 상태 — 오류와 0건을 구분한다 (최종 설계 S08) */
export type AddressSearchResultState = "idle" | "searching" | "results" | "empty" | "error";

export function resolveAddressSearchResultState(input: {
  query: string;
  searching: boolean;
  failed: boolean;
  count: number;
}): AddressSearchResultState {
  if (input.query.trim().length < 2) return "idle";
  if (input.searching) return "searching";
  if (input.failed) return "error";
  return input.count > 0 ? "results" : "empty";
}
