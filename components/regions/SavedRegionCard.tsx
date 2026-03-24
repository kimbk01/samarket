"use client";

import type { UserRegion } from "@/lib/regions/types";
import { PrimaryRegionBadge } from "./PrimaryRegionBadge";

interface SavedRegionCardProps {
  region: UserRegion;
  isCurrent: boolean;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

export function SavedRegionCard({
  region,
  isCurrent,
  onSetPrimary,
  onRemove,
  canRemove,
}: SavedRegionCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-4">
      <div>
        <p className="text-[15px] font-medium text-gray-900">{region.label}</p>
        <div className="mt-1 flex items-center gap-2">
          {region.isPrimary && <PrimaryRegionBadge />}
          {isCurrent && (
            <span className="text-[12px] text-gray-500">현재 보는 동네</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!region.isPrimary && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetPrimary(region.id);
            }}
            className="text-[13px] text-signature"
          >
            대표로
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(region.id);
            }}
            className="text-[13px] text-gray-500"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
