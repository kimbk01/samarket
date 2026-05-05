import { permanentRedirect } from "next/navigation";

export default function AdminDeliveryOrdersPage() {
  permanentRedirect("/admin/stores/orders");
}
