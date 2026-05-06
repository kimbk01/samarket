import { RiderOrderDetailClient } from "@/components/rider/RiderOrderDetailClient";

export default async function RiderOrderDetailPage(props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params;
  return <RiderOrderDetailClient orderId={typeof orderId === "string" ? orderId : ""} />;
}
