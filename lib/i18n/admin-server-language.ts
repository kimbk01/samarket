import { cookies, headers } from "next/headers";
import { resolveServerAppLanguage } from "@/lib/i18n/app-language-authority";
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

/**
 * 어드민 서버(API 응답·서버 화면 메타) 문구 언어 (언어 SSOT L25, 2026-11-08) — 요청 범위 안에서만 쓴다.
 * 화면 언어 쿠키(명시 선택) → Accept-Language(기기 언어) → ko(이전 동작: 한국어 고정).
 * 클라이언트 결정 규칙(`app-language-authority.ts`)과 같은 순서 — 쿠키가 없으면 화면도 기기 언어를 따른다.
 */
export async function adminServerLanguage(): Promise<AppLanguageCode> {
  try {
    const jar = await cookies();
    const h = await headers();
    const cookie = jar.get(APP_LANGUAGE_COOKIE)?.value;
    const acceptLanguage = h.get("accept-language");
    if (!cookie && !acceptLanguage?.trim()) return "ko";
    return resolveServerAppLanguage({ cookie, acceptLanguage });
  } catch {
    return "ko";
  }
}

/** 어드민 서버 문구 — `translateBy(요청 언어, key, vars)` */
export async function adminServerText(key: MessageKey, vars?: Record<string, unknown>): Promise<string> {
  return translateBy(await adminServerLanguage(), key, vars, "ko");
}

/** 한 요청 안에서 여러 문구를 고를 때 — 언어를 한 번만 읽고 동기 함수로 돌려준다 */
export async function adminServerTranslator(): Promise<(key: MessageKey, vars?: Record<string, unknown>) => string> {
  const lang = await adminServerLanguage();
  return (key, vars) => translateBy(lang, key, vars, "ko");
}
