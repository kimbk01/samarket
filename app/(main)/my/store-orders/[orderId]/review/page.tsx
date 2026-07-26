import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

/** Legacy order review — canonical /mypage/store-orders/:id/review. */
export default async function LegacyMyRedirectPage({ params }: PageProps) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) redirect("/mypage/store-orders");
  redirect(`/mypage/store-orders/${encodeURIComponent(orderId)}/review`);
}
