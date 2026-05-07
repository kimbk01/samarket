import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * 옛 매장 운영 허브 URL — 캐노니컬은 `/stores/owner`.
 * 기존 북마크/외부 링크가 본 경로를 가리켜도 `storeId` 쿼리를 보존하여 새 허브로 이동시킨다.
 */
export default async function MypageBusinessRoute({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  return redirect(
    storeId ? `/stores/owner?storeId=${encodeURIComponent(storeId)}` : "/stores/owner"
  );
}
