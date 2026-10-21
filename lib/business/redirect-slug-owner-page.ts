/**
 * `/stores/[slug]/owner/{orders,notifications,notification-settings}` — 호환 URL 유지, 렌더 없음.
 * 서버에서 slug → storeId 해석 후 캐노니컬 `/stores/owner/*?storeId=` 로 redirect (IA-07·IA-18).
 * 소유 검사는 캐노니컬 화면·API(`/api/me/stores/**`)가 그대로 수행한다.
 */
import { redirect } from "next/navigation";
import {
  buildSlugOwnerRedirectHref,
  type OwnerRouteSearchParams,
  type SlugOwnerSection,
} from "@/lib/business/owner-routes";
import { resolveStoreIdBySlug } from "@/lib/store-owner/queries";

export async function redirectSlugOwnerPage(
  section: SlugOwnerSection,
  params: Promise<{ slug: string }>,
  searchParams?: Promise<OwnerRouteSearchParams> | null
): Promise<never> {
  const { slug } = await params;
  const sp = searchParams == null ? null : await searchParams;
  const storeId = await resolveStoreIdBySlug(typeof slug === "string" ? slug : "");
  redirect(buildSlugOwnerRedirectHref(section, storeId, sp));
}
