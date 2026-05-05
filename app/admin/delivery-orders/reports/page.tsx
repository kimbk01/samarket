import { permanentRedirect } from "next/navigation";

export default function AdminDeliveryReportsPage() {
  permanentRedirect("/admin/stores/orders/reports");
}
