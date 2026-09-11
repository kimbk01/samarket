import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

/** Legacy order detail — canonical orders hub exact expand. */
export default async function LegacyMyRedirectPage({ params }: PageProps) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) redirect("/orders");
  redirect(`/orders?expand=${encodeURIComponent(orderId)}`);
}
