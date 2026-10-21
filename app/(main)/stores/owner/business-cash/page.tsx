import { redirect } from "next/navigation";
import { appendOwnerSearchParams, OwnerRoutes } from "@/lib/business/owner-routes";

/** 레거시 비즈니스 캐시 → Finance `section=cash` (IA-07: 쿼리 보존, section 지정 시 그대로). */
export default async function OwnerBusinessCashLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStoreId = params.storeId;
  const storeId = (Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId)?.trim() ?? "";
  const { storeId: _omit, section, ...rest } = params;
  void _omit;
  redirect(appendOwnerSearchParams(OwnerRoutes.finance(storeId), { section: section || "cash", ...rest }));
}
