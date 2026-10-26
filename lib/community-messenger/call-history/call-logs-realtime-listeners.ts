/**
 * 홈 실시간(메타 채널)이 받은 `community_messenger_call_logs` 변경을 통화 탭에 알리는 프로세스 내 리스너 — D-5.
 *
 * 통화 탭이 같은 테이블을 따로 구독하면 기기 1대에 call_logs 구독이 4개가 되고, 2026-10-26 실기기에서
 * 홈 채널은 받았는데 통화 목록 채널만 못 받는 경우가 있었다. 홈 안의 통화 탭은 이 리스너만 쓴다.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyCallLogsRealtimeChanged(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* 다른 리스너 계속 */
    }
  }
}

export function subscribeCallLogsRealtimeChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
