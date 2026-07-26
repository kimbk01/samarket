import { redirect } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";

type PageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner product edit — redirect-only. */
export default async function LegacyOwnerProductEditRedirectPage({ params, searchParams }: PageProps) {
  const { productId } = await params;
  const sp = await searchParams;
  const raw = sp.storeId;
  const storeId = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  redirect(OwnerRoutes.productEdit(productId, storeId || null));
}
