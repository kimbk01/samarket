import { permanentRedirect } from "next/navigation";

export default function AdminDeliverySettlementsPage() {
  permanentRedirect("/admin/stores/orders/settlements");
}
