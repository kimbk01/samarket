import { redirect } from "next/navigation";

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
  params.set("sheet", "profile-edit");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** 스펙 `/mypage/profile` → 내정보 프로필 수정 sheet (query preserve) */
export default async function MypageProfileAliasPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  redirect(`/mypage${buildQueryString(sp)}`);
}
