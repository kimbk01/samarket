import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";

export const dynamic = "force-dynamic";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MypageBusinessRoute({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);

  return (
    <div className="mx-auto max-w-lg px-4 pt-2 pb-8">
      <MyBusinessPage initialServerState={initialServerState} />
    </div>
  );
}
