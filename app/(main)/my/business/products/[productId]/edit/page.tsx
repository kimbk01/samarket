import { redirect } from "next/navigation";
import { appendOwnerSearchParams, OwnerRoutes } from "@/lib/business/owner-routes";

type PageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner product edit — redirect-only (쿼리 전체 보존). */
export default async function LegacyOwnerProductEditRedirectPage({ params, searchParams }: PageProps) {
  const { productId } = await params;
  const sp = await searchParams;
  redirect(appendOwnerSearchParams(OwnerRoutes.productEdit(productId), sp));
}
