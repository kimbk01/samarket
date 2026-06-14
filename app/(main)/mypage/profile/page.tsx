import { redirect } from "next/navigation";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

type SearchParams = Record<string, string | string[] | undefined>;

function buildQueryString(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v != null && String(v).trim()) params.append(key, String(v));
      }
    } else if (String(value).trim()) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** 스펙 `/mypage/profile` → canonical 프로필 편집 (query preserve) */
export default async function MypageProfileAliasPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  redirect(`${MYPAGE_PROFILE_EDIT_HREF}${buildQueryString(sp)}`);
}
