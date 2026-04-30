import { notFound, permanentRedirect } from "next/navigation";
import { parseId } from "@/lib/validate-params";

/**
 * 레거시 상품 상세 URL — 거래 물품 표준 화면은 `/post/[id]` 하나로 통일한다.
 */
export default async function LegacyProductDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  const id = parseId(resolved.id);
  if (!id) notFound();
  permanentRedirect(`/post/${id}`);
}
