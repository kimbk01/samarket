import { after } from "next/server";

/**
 * WP-8: 서버리스(예: Vercel)에서 HTTP 응답 후 인스턴스가 얼거나 회수되면
 * 진행 중이던 백그라운드 전송(APNs/FCM HTTP/2 스트림)이 취소되어
 * "pending stream has been canceled" 로 통화 푸시가 소실된다.
 *
 * `void promise` 는 인스턴스 수명을 연장하지 못한다. 이 헬퍼는 **이미 시작된**
 * 프로미스를 Next `after()` 에 넘겨 settle 까지 런타임이 인스턴스를 유지하게 한다.
 * 전송 "시작"은 호출 측에서 임계경로에 이미 일어나므로(프로미스를 먼저 만들어 전달)
 * after() 지연 금지 계약을 위반하지 않는다 — 완료 보장만 한다.
 *
 * 요청 스코프 밖(크론·테스트 등)에서 after() 가 throw 하면 조용히 void 로 폴백한다.
 * 호출 측에서 이미 .catch() 로 에러를 흡수한 best-effort 프로미스를 넘길 것.
 */
export function keepAliveAfterResponse(work: Promise<unknown>): void {
  try {
    after(() => work);
  } catch {
    void work;
  }
}
