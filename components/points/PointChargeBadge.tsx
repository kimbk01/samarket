import type { PointChargeRequestStatus } from "@/lib/types/point";

const LABELS: Record<PointChargeRequestStatus, string> = {
  pending: "대기중",
  waiting_confirm: "입금확인대기",
  on_hold: "보류",
  approved: "승인완료",
  rejected: "반려",
  cancelled: "취소",
};

const STYLES: Record<PointChargeRequestStatus, string> = {
  pending: "bg-blue-100 text-blue-800",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-sam-surface-muted text-sam-muted",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-sam-surface-muted text-sam-meta",
};

export function PointChargeBadge({ status }: { status: PointChargeRequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
