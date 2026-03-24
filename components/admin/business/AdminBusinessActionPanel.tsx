"use client";

import type { BusinessProfile } from "@/lib/types/business";
import { setBusinessProfileStatus } from "@/lib/business/mock-business-profiles";

interface AdminBusinessActionPanelProps {
  profile: BusinessProfile;
  onActionSuccess: () => void;
}

export function AdminBusinessActionPanel({
  profile,
  onActionSuccess,
}: AdminBusinessActionPanelProps) {
  const handle = (status: BusinessProfile["status"]) => {
    setBusinessProfileStatus(profile.id, status);
    onActionSuccess();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {profile.status === "pending" && (
        <>
          <button
            type="button"
            onClick={() => handle("active")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800 hover:bg-emerald-100"
          >
            승인
          </button>
          <button
            type="button"
            onClick={() => handle("rejected")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700 hover:bg-red-100"
          >
            반려
          </button>
        </>
      )}
      {profile.status === "active" && (
        <button
          type="button"
          onClick={() => handle("paused")}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-800 hover:bg-amber-100"
        >
          일시중지
        </button>
      )}
      {profile.status === "paused" && (
        <button
          type="button"
          onClick={() => handle("active")}
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800 hover:bg-emerald-100"
        >
          재개
        </button>
      )}
    </div>
  );
}
