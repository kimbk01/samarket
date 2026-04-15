export const SAMARKET_REQUEST_ID_HEADER = "x-samarket-request-id";

/**
 * 로깅/관측을 위한 요청 식별자.
 * - 외부(프록시/CDN)에서 내려준 ID가 있으면 그대로 사용
 * - 없으면 짧고 안전한 랜덤 ID를 생성
 */
export function normalizeRequestId(raw: string | null | undefined): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  // 과도한 길이/개행 등 헤더 인젝션 완화
  const safe = v.replace(/[\r\n]/g, "").slice(0, 80);
  return safe || null;
}

export function createRequestId(prefix = "req"): string {
  const rand = Math.random().toString(16).slice(2, 10);
  const t = Date.now().toString(16);
  return `${prefix}_${t}_${rand}`;
}

