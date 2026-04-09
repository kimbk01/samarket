import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MypageBusinessOrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = Array.isArray(sp.storeId) ? sp.storeId[0] : sp.storeId;
  redirect(
    storeId?.trim()
      ? `/my/business/store-orders?storeId=${encodeURIComponent(storeId.trim())}`
      : "/my/business/store-orders"
  );
}
