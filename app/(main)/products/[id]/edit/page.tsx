import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { parseId } from "@/lib/validate-params";
import { ProductTradeEditPageClient } from "@/components/products/ProductTradeEditPageClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 중고·거래 글 수정 — 서버에서 `params`를 await 해 Next 16+와 일치시키고,
 * id 검증 후 클라이언트에 넘겨 `useParams()` 타이밍 이슈를 피합니다.
 */
export default function EditProductPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <EditProductPageBody params={params} />
    </Suspense>
  );
}

async function EditProductPageBody({ params }: PageProps) {
  const resolved = await params;
  const postId = parseId(resolved.id);
  if (!postId) notFound();
  return <ProductTradeEditPageClient postId={postId} />;
}
