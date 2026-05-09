import type { NextRequest } from "next/server";

/**
 * Set-Cookie 의 `Secure` 사용 여부.
 * `NODE_ENV === "production"` 만으로 켜면 `next start` 를 LAN HTTP 로 열 때 브라우저가 쿠키를 거부한다.
 */
export function cookieSecureFromNextRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  try {
    const proto = request.nextUrl.protocol.replace(":", "").toLowerCase();
    if (proto === "https") return true;
    if (proto === "http") return false;
  } catch {
    /* ignore */
  }
  return process.env.VERCEL === "1";
}

/** `cookies()` 만 있는 Route Handler·서버 유틸용 (`NextRequest` 없을 때) */
export async function cookieSecureFromNextHeaders(): Promise<boolean> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  return process.env.VERCEL === "1";
}
