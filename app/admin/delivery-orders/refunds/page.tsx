import { permanentRedirect } from "next/navigation";

export default function AdminDeliveryRefundsPage() {
  permanentRedirect("/admin/stores/orders/refunds");
}
