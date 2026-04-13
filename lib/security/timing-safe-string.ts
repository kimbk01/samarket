import { timingSafeEqual } from "crypto";

/**
 * UTF-8 문자열 타이밍 안전 동등 비교 (짧은 API 키·Bearer 토큰·cron 시크릿용).
 * 길이가 다르면 즉시 false (길이는 누설될 수 있으나, 운영 시크릿은 고정 길이 권장).
 */
export function timingSafeEqualUtf8(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
