import { redirect } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";

export default async function OwnerBusinessCashLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStoreId = params.storeId;
  const storeId = (Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId)?.trim() ?? "";
  redirect(`${OwnerRoutes.finance(storeId)}#cash-manage`);
}
