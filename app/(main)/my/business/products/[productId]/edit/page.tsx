import Link from "next/link";
import { Suspense } from "react";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate } from "@/lib/i18n/messages";

export default function OwnerEditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFormRouteLoading />}>
      <OwnerEditProductPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerEditProductPageBody({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { productId } = await params;
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";

  if (!storeId || !pid) {
    const language = getRuntimeAppLanguage();
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="sam-text-body text-sam-fg">
          {translate(language, "business_phase7_698")}{" "}
          <code className="rounded bg-sam-surface-muted px-1">storeId</code>{" "}
          <Link href="/stores/owner" className="font-medium text-signature underline">
            {translate(language, "business_phase7_699")}
          </Link>
          {translate(language, "business_phase7_700")}
        </p>
      </div>
    );
  }

  return <OwnerProductForm mode="edit" storeId={storeId} productId={pid} />;
}
