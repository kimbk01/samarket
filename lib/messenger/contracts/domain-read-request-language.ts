/**
 * Domain Read Canary compose functions run server-side (service-role Supabase,
 * no React tree) — `getRuntimeAppLanguage()` is a client-only global synced by
 * `AppLanguageProvider` and must NOT be read here. Resolve the viewer's
 * language explicitly from the request's cookie/header instead, the same way
 * `app/layout.tsx` seeds SSR `<html lang>`.
 */
import { cookies, headers } from "next/headers";
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";

export async function resolveDomainReadRequestLanguage(): Promise<AppLanguageCode> {
  const jar = await cookies();
  const hdr = await headers();
  return resolveServerInitialLanguage({
    cookieValue: jar.get(APP_LANGUAGE_COOKIE)?.value ?? null,
    acceptLanguage: hdr.get("accept-language"),
  });
}
