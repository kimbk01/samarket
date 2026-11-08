/**
 * 서버 요청 언어 — `docs/i18n-ssot.md` §2: 화면 언어 쿠키(로그인 계정 언어를 Provider 가 반영) → Accept-Language → en.
 * 요청 밖(응답 뒤 백그라운드·테스트)에서는 `next/headers` 를 쓸 수 없어 `fallback` 을 돌려준다.
 */
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerAppLanguage } from "@/lib/i18n/app-language-authority";

export async function resolveRequestAppLanguageOr(fallback: AppLanguageCode): Promise<AppLanguageCode> {
  try {
    const { cookies, headers } = await import("next/headers");
    const jar = await cookies();
    const h = await headers();
    return resolveServerAppLanguage({
      cookie: jar.get(APP_LANGUAGE_COOKIE)?.value ?? null,
      acceptLanguage: h.get("accept-language"),
    });
  } catch {
    return fallback;
  }
}
