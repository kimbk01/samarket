import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/stores/owner` — 매장 오너 허브(캐노니컬). 매장 목록 시드는 `layout.tsx`(서버) 단일 경로.
 */
export default async function StoresOwnerHubRoute({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);
  return <MyBusinessPage initialServerState={initialServerState} />;
}
