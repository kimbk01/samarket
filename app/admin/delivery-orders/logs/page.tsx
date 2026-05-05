import { permanentRedirect } from "next/navigation";

export default function AdminDeliveryAuditLogsPage() {
  permanentRedirect("/admin/stores/orders/logs");
}
