/**
 * F-11 — 친구·숨김 목록 조회 DB 오류를 「빈 목록」으로 삼키지 않기 위한 오류 타입.
 * 빈 배열로 처리하면 숨긴 친구가 다시 보이거나 목록이 비어 보인다 → 라우트는 5xx, 클라이언트는 기존 목록 유지.
 * (테이블 미적용 환경 `does not exist` 만 빈 목록 허용)
 */
export class MessengerSocialGraphReadError extends Error {
  readonly source: string;

  constructor(source: string, cause?: unknown) {
    super(`social_graph_read_failed:${source}`);
    this.name = "MessengerSocialGraphReadError";
    this.source = source;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export function isMessengerSocialGraphReadError(error: unknown): error is MessengerSocialGraphReadError {
  return error instanceof MessengerSocialGraphReadError;
}
