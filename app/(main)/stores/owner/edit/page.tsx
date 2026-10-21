import { redirect } from "next/navigation";
import { appendOwnerSearchParams, OwnerRoutes } from "@/lib/business/owner-routes";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 레거시 mock 편집 — 실 매장 프로필 편집으로 통합 (IA-07: storeId·쿼리 보존) */
export default async function BusinessEditRoute({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = sp.storeId;
  const storeId = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  redirect(appendOwnerSearchParams(OwnerRoutes.profile(storeId), sp, ["storeId"]));
}
