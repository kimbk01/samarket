/**
 * N-3 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1): 방 안에서 「모두에게서 삭제」를 받은 뒤 목록으로
 * 돌아오면 미리보기가 원문으로 남았다. 휴대폰은 방 안에 있는 동안 목록 실시간이 없고, 목록 복귀 정합(D-7 W2)은
 * 서버 확인 10초 미만이면 건너뛴다. 방 화면이 삭제를 새로 반영하면 다음 목록 복귀 때 정합을 1회 강제한다.
 */
let needed = false;

export function markHomeListReturnReconcileNeeded(): void {
  needed = true;
}

/** 읽고 지운다 — 복귀 1회에만 적용 */
export function consumeHomeListReturnReconcileNeeded(): boolean {
  const v = needed;
  needed = false;
  return v;
}
