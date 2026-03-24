/**
 * 관리자 메모: 테스트 기간 수동 적용 항목 / 실서비스 전 처리 목록
 * - 항목 추가·수정: 이 파일에서 text 수정
 * - 적용 완료: 대화에서 "N번 적용해줘" 요청 → 코드 반영 후 해당 항목에 applied: true 설정
 */

export interface MemoItem {
  id: string;
  text: string;
  /** true면 적용 완료 (체크 표시). 적용 시 개발자/AI가 코드 반영 후 여기를 true로 수정 */
  applied?: boolean;
}

/** 테스트 기간 중 임의로 수동 적용된 부분 (나중에 정식 반영할 것) */
export const MANUAL_DURING_TEST: MemoItem[] = [
  { id: "1", text: "구글 위치 정보는 향후 적용", applied: false },
  // 추가: { id: "2", text: "...", applied: false },
];

/** 실서비스 전에 처리해야 할 부분 */
export const BEFORE_PRODUCTION: MemoItem[] = [
  // 추가: { id: "1", text: "...", applied: false },
];
