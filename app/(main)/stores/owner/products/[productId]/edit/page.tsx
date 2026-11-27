import Link from "next/link";
import { Suspense } from "react";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductEditSupportShell } from "@/components/support/OwnerProductEditSupportShell";
import { resolveRequestAppLanguageOr } from "@/lib/i18n/request-app-language";
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
    /** 언어 재감사 2026-11-27: 주소 변수 이름(storeId)을 화면에 쓰지 않는다 · 서버는 요청 언어 */
    const language = await resolveRequestAppLanguageOr("en");
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="sam-text-body text-sam-fg">
          {translate(language, "owner_product_edit_need_store")}{" "}
          <Link href="/stores/owner" className="font-medium text-signature underline">
            {translate(language, "business_phase7_699")}
          </Link>
        </p>
      </div>
    );
  }

  return <OwnerProductEditSupportShell storeId={storeId} productId={pid} />;
}
