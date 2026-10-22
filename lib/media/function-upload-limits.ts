/**
 * IMG-02 — 함수(Vercel) 경유 multipart 업로드 안전 상한 (클라이언트·서버 공용 순수 상수).
 * Vercel 서버리스 함수 요청 본문 한도(~4.5MB) − multipart 경계·필드 여유 ≈ 3.5MB.
 * 근거: `lib/launch-intro/server.ts` · 메신저 `MESSENGER_MULTIPART_SAFE_MAX_BYTES` (같은 값).
 */
export const FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);
