/**
 * PC QR 로그인 — 클라·서버 공용 계약 (설계: docs/audit/windows-qr-login-design-2026-11-08.md).
 *
 * QR 내용은 URL 이 아니다: `dibay-pc-login:v1:<요청 id>:<nonce>`.
 * 휴대폰 기본 카메라·다른 QR 앱이 열 수 있는 주소가 아니므로, 로그인된 **디바이 앱 안의 스캐너**에서만 의미가 있다
 * (QRLJacking 대응 — 앱 안 스캔 + 확인 화면).
 */

export const PC_QR_LOGIN_PAYLOAD_PREFIX = "dibay-pc-login:v1:";

/** QR 수명 — 2분 (설계 §4-1) */
export const PC_QR_LOGIN_TTL_MS = 120_000;

/** PC 상태 확인 간격 — 비로그인 PC 는 실시간 비공개 채널을 받을 수 없다(설계 §3) */
export const PC_QR_LOGIN_POLL_MS = 2_000;

/** PC 비밀값 httpOnly 쿠키 (경로를 QR API 로 한정) */
export const PC_QR_LOGIN_SECRET_COOKIE = "dibay_pc_qr_secret";
export const PC_QR_LOGIN_COOKIE_PATH = "/api/auth/qr-login";

export type PcQrLoginStatus = "pending" | "approved" | "consumed" | "expired" | "cancelled";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function isPcQrLoginRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isPcQrLoginNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE_RE.test(value);
}

export function buildPcQrLoginPayload(requestId: string, nonce: string): string {
  return `${PC_QR_LOGIN_PAYLOAD_PREFIX}${requestId}:${nonce}`;
}

/** 휴대폰 스캐너 — 디바이 PC 로그인 QR 이 아니면 null */
export function parsePcQrLoginPayload(text: string | null | undefined): { requestId: string; nonce: string } | null {
  const raw = String(text ?? "").trim();
  if (!raw.startsWith(PC_QR_LOGIN_PAYLOAD_PREFIX)) return null;
  const rest = raw.slice(PC_QR_LOGIN_PAYLOAD_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const requestId = rest.slice(0, sep);
  const nonce = rest.slice(sep + 1);
  if (!isPcQrLoginRequestId(requestId) || !isPcQrLoginNonce(nonce)) return null;
  return { requestId, nonce };
}
