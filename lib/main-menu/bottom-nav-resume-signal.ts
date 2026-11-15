/**
 * 하단 탭 복귀 신호 — 앱이 다시 보이는 즉시(복귀 조정자 `ui` 레인) 1회 발행 (계약 v2 · Owner 2026-11-15 · 설계서 §5-5 B4).
 * 구독자: 키보드 숨김 판정(포커스 다시 읽기) · 스크롤 숨김(다시 보이게). 컨트롤러 멈춤 감시는 작업이 직접 부른다.
 * 숨겨진 동안 키보드가 닫히거나 스크롤 이벤트를 놓쳐도 하단 탭이 숨김·누를 수 없음(inert)으로 남지 않게 한다.
 */
const listeners = new Set<() => void>();

export function subscribeBottomNavResume(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitBottomNavResume(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* 구독자 하나의 실패가 다른 구독자를 막지 않게 */
    }
  }
}
