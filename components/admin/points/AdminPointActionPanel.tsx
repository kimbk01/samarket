"use client";

import type { PointChargeRequest } from "@/lib/types/point";
import {
  approvePointChargeRequest,
  rejectPointChargeRequest,
  holdPointChargeRequest,
} from "@/lib/points/mock-point-charge-requests";

interface AdminPointActionPanelProps {
  request: PointChargeRequest;
  onActionSuccess: () => void;
}

export function AdminPointActionPanel({
  request,
  onActionSuccess,
}: AdminPointActionPanelProps) {
  const handle = (fn: () => PointChargeRequest | undefined) => {
    fn();
    onActionSuccess();
  };

  const canAct =
    request.requestStatus === "pending" ||
    request.requestStatus === "waiting_confirm" ||
    request.requestStatus === "on_hold";

  return (
    <div className="flex flex-wrap gap-2">
      {canAct && (
        <>
          <button
            type="button"
            onClick={() => handle(() => approvePointChargeRequest(request.id))}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800 hover:bg-emerald-100"
          >
            승인
          </button>
          <button
            type="button"
            onClick={() => handle(() => rejectPointChargeRequest(request.id))}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700 hover:bg-red-100"
          >
            반려
          </button>
          {request.requestStatus !== "on_hold" && (
            <button
              type="button"
              onClick={() => handle(() => holdPointChargeRequest(request.id))}
              className="rounded border border-gray-200 bg-gray-100 px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-200"
            >
              보류
            </button>
          )}
        </>
      )}
    </div>
  );
}
