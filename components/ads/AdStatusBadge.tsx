import type { AdApplyStatus } from "@/lib/ads/types";
import { AD_APPLY_STATUS_LABELS } from "@/lib/ads/types";

const STATUS_STYLES: Record<AdApplyStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_payment: "bg-amber-100 text-amber-800",
  pending_review: "bg-blue-100 text-blue-800",
  approved: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
};

export function AdStatusBadge({ status }: { status: AdApplyStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {AD_APPLY_STATUS_LABELS[status]}
    </span>
  );
}
