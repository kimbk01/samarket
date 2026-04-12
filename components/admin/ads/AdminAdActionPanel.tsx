"use client";

import type { AdApplication } from "@/lib/types/ad-application";
import {
  markAdApplicationPaid,
  approveAdApplication,
  rejectAdApplication,
  activateAdApplication,
  expireAdApplication,
} from "@/lib/ads/mock-ad-applications";

interface AdminAdActionPanelProps {
  application: AdApplication;
  onActionSuccess: () => void;
}

export function AdminAdActionPanel({
  application,
  onActionSuccess,
}: AdminAdActionPanelProps) {
  const handle = (fn: () => AdApplication | undefined) => {
    fn();
    onActionSuccess();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {application.paymentStatus === "waiting_confirm" && (
        <button
          type="button"
          onClick={() => handle(() => markAdApplicationPaid(application.id))}
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800 hover:bg-emerald-100"
        >
          입금 확인
        </button>
      )}
      {["waiting_payment", "pending"].includes(application.applicationStatus) &&
        application.paymentStatus === "paid" && (
          <button
            type="button"
            onClick={() => handle(() => approveAdApplication(application.id))}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800 hover:bg-emerald-100"
          >
            승인
          </button>
        )}
      {["waiting_payment", "pending"].includes(application.applicationStatus) && (
        <button
          type="button"
          onClick={() => handle(() => rejectAdApplication(application.id))}
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700 hover:bg-red-100"
        >
          반려
        </button>
      )}
      {application.applicationStatus === "approved" && (
        <button
          type="button"
          onClick={() => handle(() => activateAdApplication(application.id))}
          className="rounded border border-signature bg-signature/10 px-3 py-2 text-[14px] text-signature hover:bg-signature/20"
        >
          노출 시작
        </button>
      )}
      {application.applicationStatus === "active" && (
        <button
          type="button"
          onClick={() => handle(() => expireAdApplication(application.id))}
          className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 text-[14px] text-sam-fg hover:bg-sam-border-soft"
        >
          노출 종료
        </button>
      )}
    </div>
  );
}
