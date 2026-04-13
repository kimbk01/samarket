import { timingSafeEqualUtf8 } from "@/lib/security/timing-safe-string";

/**
 * Vercel Cron / 수동 호출 — `Authorization: Bearer <CRON_SECRET>` 또는 `x-cron-secret: <CRON_SECRET>`
 * 문자열 비교는 타이밍 안전.
 */
export function verifyCronRequestAuthorization(req: Request, envSecret: string | undefined): boolean {
  const secret = envSecret?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = "Bearer ";
  if (auth.startsWith(bearer)) {
    const token = auth.slice(bearer.length).trim();
    return timingSafeEqualUtf8(token, secret);
  }

  const header = req.headers.get("x-cron-secret")?.trim() ?? "";
  return timingSafeEqualUtf8(header, secret);
}
