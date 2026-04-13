import { headers } from "next/headers";
import { NextRequest } from "next/server";

/**
 * RSC에서 `/api/home/posts` 와 동일한 쿠키·호스트로 NextRequest 를 만들어
 * `resolveHomePostsGetData` 와 공유 로직을 호출한다 (브라우저 추가 왕복 없음).
 */
export async function buildHomeTradeSeedRequest(): Promise<NextRequest> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  return new NextRequest(`${proto}://${host}/api/home/posts?page=1&sort=latest`, {
    headers: cookie ? { cookie } : undefined,
  });
}
