import { permanentRedirect } from "next/navigation";

export default function AdminDeliveryCancellationsPage() {
  permanentRedirect("/admin/stores/orders/cancellations");
}
