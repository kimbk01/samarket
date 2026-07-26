/**
 * `/my/business/**` · `/mypage/business/**` 는 Owner View를 렌더하지 않는다.
 * 서버 redirect + path mapping 만 허용. CONTRACT: lib/business/owner-routes.ts
 */
import { redirect } from "next/navigation";
import { buildLegacyOwnerRedirectHref } from "@/lib/business/owner-routes";

type SearchParams = Record<string, string | string[] | undefined>;

export async function redirectLegacyOwnerPage(
  legacyPath: string,
  searchParams?: Promise<SearchParams> | SearchParams | null
): Promise<never> {
  const sp = searchParams == null ? null : await Promise.resolve(searchParams);
  redirect(buildLegacyOwnerRedirectHref(legacyPath, sp));
}
