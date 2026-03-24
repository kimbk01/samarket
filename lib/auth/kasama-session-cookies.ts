import { cookies, headers } from "next/headers";
import {
  KASAMA_DEV_UID_COOKIE,
  KASAMA_DEV_UID_PUB_COOKIE,
} from "@/lib/auth/dev-session-cookie";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

function parseNamedCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  const prefix = `${name}=`;
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      let v = p.slice(prefix.length).trim();
      try {
        v = decodeURIComponent(v);
      } catch {
        /* keep raw */
      }
      const t = v.trim();
      if (isUuidLikeString(t)) return t;
    }
  }
  return null;
}

/**
 * 아이디 로그인 세션 UUID — Cookie 요청 헤더 → cookies() API 순 (Next Route Handler 불일치 보강).
 * HttpOnly(kasama_dev_uid) 우선, 개발용 미러(kasama_dev_uid_pub) 다음.
 */
export async function readKasamaDevUserIdFromRequest(): Promise<string | null> {
  const h = await headers();
  const ch = h.get("cookie");
  let uid = parseNamedCookie(ch, KASAMA_DEV_UID_COOKIE);
  if (!uid) uid = parseNamedCookie(ch, KASAMA_DEV_UID_PUB_COOKIE);
  if (uid) return uid;

  const jar = await cookies();
  const c1 = jar.get(KASAMA_DEV_UID_COOKIE)?.value?.trim();
  if (c1 && isUuidLikeString(c1)) return c1;
  const c2 = jar.get(KASAMA_DEV_UID_PUB_COOKIE)?.value?.trim();
  if (c2 && isUuidLikeString(c2)) return c2;

  return null;
}
