import { after } from "next/server";

/**
 * 미디어(이미지·스티커·파일·음성·게시글 공유) 송신 라우트용 — 서비스가 이미 시작한 수신자 알림 Promise 를
 * `after()` 에 등록해 응답(ACK) 이후에도 서버리스 런타임이 알림 작업 완료까지 살아 있게 한다.
 *
 * 알림은 서비스 내부에서 **응답 전에 이미 시작**된다(기존 순서 그대로). 여기서는 수명만 보장한다 —
 * `after()` 콜백 안에서 새로 시작하지 않으므로 44e7073fe 의 "after() 안에서 시작한 insert 정체" 문제와 무관.
 * 요청 스코프 밖(스크립트·테스트)에서는 `after()` 가 throw 하므로 무시한다(기존 fire-and-forget 과 동일).
 */
export function keepMessengerNotifyAliveAfterAck(done: Promise<void>): void {
  try {
    after(() => done.catch(() => {}));
  } catch {
    /* outside request scope — Promise 는 이미 실행 중 */
  }
}
